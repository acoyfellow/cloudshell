<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import '@xterm/xterm/css/xterm.css';
import type { WorkspaceController } from '$lib/cloudshell/workspace-controller.svelte';
import LoadingPane from './loading-pane.svelte';

  let {
    controller,
    sessionId,
    tabId,
  }: {
    controller: WorkspaceController;
    sessionId: string;
    tabId: string;
  } = $props();

  const TERMINAL_BACKGROUND = '#000000';

  let terminalElement = $state<HTMLDivElement | null>(null);
  let socket: WebSocket | null = null;
  let terminal: any = null;
  let fitAddon: any = null;
  let resizeObserver: ResizeObserver | null = null;
  let disposeResize: (() => void) | null = null;
  let reconnectSequence = 0;
  let fitFrame = 0;
  let fitTimeout: number | null = null;
  let lastResizeKey = '';

  // Auto-reconnect on stale close (container sleepAfter, network blip, wake-from-sleep).
  // Exponential backoff up to a cap; reset on successful open.
  let reconnectAttempt = 0;
  let reconnectTimer: number | null = null;
  let lastDisconnectReason = '';
  const MAX_RECONNECT_ATTEMPTS = 6;

  function computeBackoffMs(attempt: number): number {
    // 500ms, 1s, 2s, 4s, 8s, 15s (capped)
    return Math.min(500 * Math.pow(2, attempt), 15_000);
  }

  function scheduleReconnect() {
    if (reconnectTimer !== null) return;
    if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      controller.setTerminalStatus(
        'disconnected',
        `Terminal connection lost${lastDisconnectReason ? ` — ${lastDisconnectReason}` : ''}. Click to retry.`
      );
      return;
    }
    const delay = computeBackoffMs(reconnectAttempt);
    reconnectAttempt += 1;
    controller.setTerminalStatus('connecting');
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      void reconnectTerminal();
    }, delay);
  }

  function cancelScheduledReconnect() {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function resetReconnectBudget() {
    reconnectAttempt = 0;
    lastDisconnectReason = '';
    cancelScheduledReconnect();
  }

  /**
   * Server-side text frames carry JSON control messages, not terminal bytes.
   * Handling them explicitly stops `{"type":"ready"}` (and error/exit) from
   * rendering as literal text in the xterm canvas.
   *
   * Known types from worker/container/main.go:
   *   - {type: "ready"}           first frame after pty.Start succeeds
   *   - {type: "error", message}  pty startup failed
   *   - {type: "exit", code}      shell exited
   */
  function handleControlMessage(text: string): boolean {
    if (!text.startsWith('{')) return false;
    let msg: any;
    try {
      msg = JSON.parse(text);
    } catch {
      return false;
    }
    if (!msg || typeof msg.type !== 'string') return false;
    switch (msg.type) {
      case 'ready':
        // fresh PTY attached; make sure status is 'connected' (reconnect path)
        controller.setTerminalStatus('connected');
        resetReconnectBudget();
        return true;
      case 'error':
        controller.setTerminalStatus(
          'disconnected',
          typeof msg.message === 'string' ? msg.message : 'Terminal error'
        );
        return true;
      case 'exit':
        // shell exited; show a friendly prompt, then let user click to reconnect
        try {
          terminal?.writeln(`\r\n[shell exited${typeof msg.code === 'number' ? ` code=${msg.code}` : ''}]`);
        } catch {
          // ignore
        }
        controller.setTerminalStatus('disconnected', 'Shell exited.');
        return true;
      default:
        return false;
    }
  }

  function sendTerminalResize(force = false) {
    if (!browser || !terminal || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const cols = terminal.cols;
    const rows = terminal.rows;
    if (!cols || !rows) {
      return;
    }

    const nextKey = `${cols}x${rows}`;
    if (!force && nextKey === lastResizeKey) {
      return;
    }

    lastResizeKey = nextKey;
    socket.send(JSON.stringify({ type: 'resize', cols, rows }));
  }

  function runTerminalFit() {
    if (!browser || !terminal || !fitAddon || !terminalElement) {
      return;
    }

    const { width, height } = terminalElement.getBoundingClientRect();
    if (width < 24 || height < 24) {
      return;
    }

    try {
      fitAddon.fit();
      sendTerminalResize();
    } catch {
      // xterm can throw during rapid layout changes while the DOM is settling.
    }
  }

  function scheduleTerminalFit(delay = 0) {
    if (!browser) {
      return;
    }

    if (fitTimeout !== null) {
      window.clearTimeout(fitTimeout);
      fitTimeout = null;
    }

    if (fitFrame) {
      window.cancelAnimationFrame(fitFrame);
      fitFrame = 0;
    }

    const fitAfterPaint = () => {
      fitFrame = window.requestAnimationFrame(() => {
        fitFrame = window.requestAnimationFrame(() => {
          fitFrame = 0;
          runTerminalFit();
        });
      });
    };

    if (delay > 0) {
      fitTimeout = window.setTimeout(() => {
        fitTimeout = null;
        fitAfterPaint();
      }, delay);
      return;
    }

    fitAfterPaint();
  }

  function writeTerminalPayload(payload: string | ArrayBuffer | Blob) {
    if (!terminal) {
      return;
    }

    if (typeof payload === 'string') {
      // Server-side text frames are JSON control messages (ready/error/exit),
      // not terminal bytes. PTY bytes always arrive as binary frames. Route
      // control messages through handleControlMessage so they don't render as
      // literal text in the xterm canvas (pre-fix: `{"type":"ready"}` was
      // visible at the top of every freshly attached terminal).
      if (handleControlMessage(payload)) {
        return;
      }
      terminal.write(payload);
      controller.recordTerminalOutput(payload);
      return;
    }

    if (payload instanceof Blob) {
      payload.arrayBuffer().then((buffer) => writeTerminalPayload(buffer));
      return;
    }

    const text = new TextDecoder().decode(payload);
    terminal.write(new Uint8Array(payload));
    controller.recordTerminalOutput(text);
  }

  async function reconnectTerminal() {
    if (!browser || !terminal || !sessionId || !tabId) {
      return;
    }

    const sequence = ++reconnectSequence;
    socket?.close();
    terminal.clear();
    lastResizeKey = '';
    scheduleTerminalFit();

    controller.setTerminalStatus('connecting');
    try {
      const params = new URLSearchParams({
        sessionId,
        tabId,
      });
      const response = await fetch(`/api/cloudshell/terminal-connection?${params.toString()}`);
      const payload = (await response.json()) as { url?: string; error?: string; mode?: 'proxy' | 'direct' };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error || 'Unable to create terminal connection');
      }

      if (sequence !== reconnectSequence) {
        return;
      }

      const nextSocket = new WebSocket(payload.url);
      nextSocket.binaryType = 'arraybuffer';
      nextSocket.onopen = () => {
        if (sequence !== reconnectSequence) {
          nextSocket.close();
          return;
        }

        socket = nextSocket;
        lastResizeKey = '';
        controller.setTerminalStatus('connected');
        resetReconnectBudget();
        scheduleTerminalFit();
        scheduleTerminalFit(120);
      };
      nextSocket.onmessage = (event) => {
        if (sequence !== reconnectSequence) {
          return;
        }

        writeTerminalPayload(event.data);
      };
      nextSocket.onerror = () => {
        if (sequence === reconnectSequence) {
          lastDisconnectReason = 'network error';
          // Let onclose drive the reconnect policy — WebSocket always fires
          // close after error. Avoid double-scheduling.
        }
      };
      nextSocket.onclose = (ev) => {
        if (sequence !== reconnectSequence) {
          return;
        }
        // Clean user-initiated close: don't fight it.
        if (ev.code === 1000) {
          controller.setTerminalStatus('disconnected', 'Terminal connection closed.');
          return;
        }
        // Anything else — container sleep, network blip, edge eviction — is
        // recoverable. Let the user stay in the terminal and silently rebuild
        // the socket. Status flips to 'connecting' during the attempt so the
        // loading overlay shows instead of the scary "Terminal unavailable"
        // error card. Budget exhausts after ~30s of retries (cap of 6).
        lastDisconnectReason = ev.reason || `code ${ev.code}`;
        scheduleReconnect();
      };
    } catch (error) {
      const message = (error as Error).message || 'Unable to create terminal connection';
      if (sequence === reconnectSequence) {
        lastDisconnectReason = message;
        // Transient /api/cloudshell/terminal-connection failures (expired
        // session, rolling deploy) also deserve a retry pass.
        scheduleReconnect();
      }
    }
  }

  async function initializeTerminal() {
    const [{ Terminal }, { FitAddon }] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
    ]);

    terminal = new Terminal({
      cursorBlink: true,
      fontFamily: '"IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace',
      fontSize: 13,
      theme: {
        background: TERMINAL_BACKGROUND,
        foreground: '#f2efe8',
        cursor: '#f7f4ed',
        selectionBackground: '#6b7cff33',
      },
      allowTransparency: true,
    });

    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalElement!);
    scheduleTerminalFit();
    scheduleTerminalFit(120);
    void document.fonts?.ready.then(() => {
      scheduleTerminalFit();
    });

    terminal.onData((data: string) => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(new TextEncoder().encode(data));
      }
      controller.recordTerminalOutput(data);
    });

    terminal.onResize(() => {
      sendTerminalResize();
    });

    const resize = () => {
      scheduleTerminalFit();
    };

    // Wake-from-stale-tab handler: when the user comes back to the tab
    // (classic "closed laptop / switched tabs for an hour" flow), either:
    //   - the WebSocket is still OPEN: just re-fit (existing behavior)
    //   - the WebSocket has CLOSED while we weren't looking: kick off a
    //     reconnect immediately instead of waiting for a keypress.
    // This is the "1006 on stale tab" fix — user doesn't need to reload.
    const onVisibilityOrFocus = () => {
      scheduleTerminalFit();
      if (document.visibilityState !== 'visible') return;
      const state = socket?.readyState;
      if (state === WebSocket.OPEN) return;
      if (state === WebSocket.CONNECTING) return;
      // CLOSED, CLOSING, or no socket — reconnect. Reset budget so a fresh
      // return to the tab gets the full retry allowance.
      resetReconnectBudget();
      void reconnectTerminal();
    };

    resizeObserver = new ResizeObserver(() => {
      scheduleTerminalFit();
    });
    resizeObserver.observe(terminalElement!);

    window.addEventListener('resize', resize);
    window.addEventListener('focus', onVisibilityOrFocus);
    window.addEventListener('online', onVisibilityOrFocus);
    window.visualViewport?.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibilityOrFocus);
    disposeResize = () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('focus', onVisibilityOrFocus);
      window.removeEventListener('online', onVisibilityOrFocus);
      window.visualViewport?.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      resizeObserver?.disconnect();
      resizeObserver = null;
    };

    await reconnectTerminal();
  }

  /**
   * User-initiated retry. Exposed so the "Terminal unavailable" card can
   * offer a Retry affordance once the auto-reconnect budget is exhausted.
   */
  function manualRetry() {
    resetReconnectBudget();
    void reconnectTerminal();
  }

  onMount(() => {
    if (!sessionId || !tabId) {
      return;
    }

    void initializeTerminal();

    return () => {
      cancelScheduledReconnect();
      socket?.close();
      terminal?.dispose();
      if (fitTimeout !== null) {
        window.clearTimeout(fitTimeout);
      }
      if (fitFrame) {
        window.cancelAnimationFrame(fitFrame);
      }
      disposeResize?.();
    };
  });
</script>

{#if sessionId && tabId}
<div
  class="relative flex h-full min-h-0 flex-1 overflow-hidden rounded-none shadow-none"
  style:background={TERMINAL_BACKGROUND}
>
    <div
      bind:this={terminalElement}
      class="absolute inset-0 min-h-0 min-w-0 overflow-hidden"
    ></div>

    {#if controller.terminalStatus !== 'connected'}
      {#if controller.terminalStatus === 'connecting'}
        <LoadingPane
          overlay
          title="Attaching terminal"
          description="Starting the active shell and restoring its session state."
        />
      {:else}
        <div
          class="bg-background/80 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-[1px]"
          aria-live="polite"
        >
          <div class="bg-card flex max-w-xs flex-col items-center gap-3 rounded-md border px-4 py-4 text-center shadow-none">
            <AlertCircle class="text-destructive size-5" />
            <div class="space-y-1">
              <div class="text-sm font-medium">Terminal unavailable</div>
              <p class="text-muted-foreground text-sm">
                {controller.terminalError || 'The terminal could not connect.'}
              </p>
            </div>
            <button
              type="button"
              class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-sm font-medium"
              onclick={manualRetry}
            >
              Reconnect
            </button>
          </div>
        </div>
      {/if}
    {/if}
  </div>
{:else}
  <div class="flex h-full min-h-0 flex-1" style:background={TERMINAL_BACKGROUND}>
    <LoadingPane
      title="Preparing workspace"
      description="Waiting for the active session and tab to resolve before attaching the terminal."
    />
  </div>
{/if}
