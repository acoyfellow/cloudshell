<script lang="ts">
  /**
   * terminal-pane.svelte — renders the cloud shell terminal using
   * `@wterm/dom` (Zig + WASM core + DOM renderer).
   *
   * History: this file was xterm.js-backed until 2026-04-19. Swapped
   * wholesale to wterm because xterm's canvas renderer was hostile to
   * browser-native UX — Cmd+F couldn't find terminal output, selection
   * across wrapped rows was janky, a11y was broken. wterm renders real
   * <span> cells; find/select/scroll/screen readers all Just Work.
   *
   * wterm (vercel-labs/wterm) is v0.1.x with a single maintainer
   * (ctate). If it ever goes stale, reverting to xterm is a focused
   * change — the WS reconnect / MCP bridge ticket delivery / container
   * control-message plumbing in this file is terminal-library agnostic.
   */
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
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
  let terminal: import('@wterm/dom').WTerm | null = null;
  let disposeResize: (() => void) | null = null;
  let reconnectSequence = 0;

  // Auto-reconnect state — identical to xterm version.
  let reconnectAttempt = 0;
  let reconnectTimer: number | null = null;
  let lastDisconnectReason = '';
  const MAX_RECONNECT_ATTEMPTS = 6;

  function computeBackoffMs(attempt: number): number {
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

  async function deliverBridgeTicket(ws: WebSocket) {
    try {
      if (ws.readyState !== WebSocket.OPEN) return;
      const response = await fetch('/api/cloudshell/ticket/mint-bridge', {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) return;
      const { ticket, expiresAt } = (await response.json()) as {
        ticket?: string;
        expiresAt?: number;
      };
      if (!ticket) return;
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'bridge_ticket', ticket, expiresAt }));
    } catch {
      // Non-fatal
    }
  }

  /**
   * Control messages from the Go container — same shape as xterm
   * version. We still route these through controller state; the text
   * itself is not written to the terminal buffer (otherwise JSON
   * leaks into the visible output).
   */
  function handleControlMessage(text: string): boolean {
    if (!text.startsWith('{')) return false;
    let msg: { type?: string; message?: string; code?: number };
    try {
      msg = JSON.parse(text);
    } catch {
      return false;
    }
    if (!msg || typeof msg.type !== 'string') return false;
    switch (msg.type) {
      case 'ready':
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
        try {
          terminal?.write(
            `\r\n[shell exited${typeof msg.code === 'number' ? ` code=${msg.code}` : ''}]\r\n`
          );
        } catch {
          // ignore
        }
        controller.setTerminalStatus('disconnected', 'Shell exited.');
        return true;
      default:
        return false;
    }
  }

  function sendTerminalResize() {
    if (!terminal || !socket || socket.readyState !== WebSocket.OPEN) return;
    const cols = terminal.cols;
    const rows = terminal.rows;
    if (!cols || !rows) return;
    socket.send(JSON.stringify({ type: 'resize', cols, rows }));
  }

  function writeTerminalPayload(payload: string | ArrayBuffer | Blob) {
    if (!terminal) return;

    if (typeof payload === 'string') {
      if (handleControlMessage(payload)) return;
      terminal.write(payload);
      controller.recordTerminalOutput(payload);
      return;
    }

    if (payload instanceof Blob) {
      payload.arrayBuffer().then((buffer) => writeTerminalPayload(buffer));
      return;
    }

    const bytes = new Uint8Array(payload);
    const text = new TextDecoder().decode(bytes);
    terminal.write(bytes);
    controller.recordTerminalOutput(text);
  }

  async function reconnectTerminal() {
    if (!browser || !terminal || !sessionId || !tabId) return;

    const sequence = ++reconnectSequence;
    socket?.close();

    controller.setTerminalStatus('connecting');
    try {
      const params = new URLSearchParams({ sessionId, tabId });
      const response = await fetch(
        `/api/cloudshell/terminal-connection?${params.toString()}`
      );
      const payload = (await response.json()) as {
        url?: string;
        error?: string;
      };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error || 'Unable to create terminal connection');
      }
      if (sequence !== reconnectSequence) return;

      const nextSocket = new WebSocket(payload.url);
      nextSocket.binaryType = 'arraybuffer';
      nextSocket.onopen = () => {
        if (sequence !== reconnectSequence) {
          nextSocket.close();
          return;
        }
        socket = nextSocket;
        controller.setTerminalStatus('connected');
        resetReconnectBudget();
        // wterm's autoResize ResizeObserver has already fired by the
        // time we get here; send initial size in case it sized before
        // the socket opened.
        sendTerminalResize();
        void deliverBridgeTicket(nextSocket);
      };
      nextSocket.onmessage = (event) => {
        if (sequence !== reconnectSequence) return;
        writeTerminalPayload(event.data);
      };
      nextSocket.onerror = () => {
        if (sequence === reconnectSequence) {
          lastDisconnectReason = 'network error';
        }
      };
      nextSocket.onclose = (ev) => {
        if (sequence !== reconnectSequence) return;
        if (ev.code === 1000) {
          controller.setTerminalStatus('disconnected', 'Terminal connection closed.');
          return;
        }
        lastDisconnectReason = ev.reason || `code ${ev.code}`;
        scheduleReconnect();
      };
    } catch (error) {
      const message =
        (error as Error).message || 'Unable to create terminal connection';
      if (sequence === reconnectSequence) {
        lastDisconnectReason = message;
        scheduleReconnect();
      }
    }
  }

  async function initializeTerminal() {
    const { WTerm } = await import('@wterm/dom');

    terminal = new WTerm(terminalElement!, {
      autoResize: true,
      cursorBlink: true,
      onData: (data) => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(new TextEncoder().encode(data));
        }
        controller.recordTerminalOutput(data);
      },
      onResize: () => {
        sendTerminalResize();
      },
    });
    await terminal.init();

    const onVisibilityOrFocus = () => {
      if (document.visibilityState !== 'visible') return;
      const state = socket?.readyState;
      if (state === WebSocket.OPEN) return;
      if (state === WebSocket.CONNECTING) return;
      resetReconnectBudget();
      void reconnectTerminal();
    };

    window.addEventListener('focus', onVisibilityOrFocus);
    window.addEventListener('online', onVisibilityOrFocus);
    document.addEventListener('visibilitychange', onVisibilityOrFocus);

    disposeResize = () => {
      window.removeEventListener('focus', onVisibilityOrFocus);
      window.removeEventListener('online', onVisibilityOrFocus);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
    };

    await reconnectTerminal();
  }

  function manualRetry() {
    resetReconnectBudget();
    void reconnectTerminal();
  }

  onMount(() => {
    if (!sessionId || !tabId) return;
    void initializeTerminal();

    return () => {
      cancelScheduledReconnect();
      socket?.close();
      terminal?.destroy();
      disposeResize?.();
    };
  });
</script>

<svelte:head>
  <!-- wterm's DOM renderer ships a small CSS for row layout + colors. -->
  <link rel="stylesheet" href="/wterm.css" />
</svelte:head>

<style>
  /*
   * Theme overrides for wterm.
   *
   * wterm.css ships sensible defaults, but we want:
   *   - full-bleed inside the pane (no padding, border-radius, shadow)
   *   - our monospace stack
   *   - black background, bone foreground (matches xterm theme)
   *
   * Targeting :global(.wterm) because wterm adds that class to our
   * host div at init. The scoped style wouldn't reach it otherwise.
   */
  :global(.wterm-host.wterm) {
    --term-font-family: "IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace;
    --term-font-size: 13px;
    --term-line-height: 1.3;
    --term-row-height: 17px;
    --term-bg: #000000;
    --term-fg: #f2efe8;
    --term-cursor: #f7f4ed;

    /*
     * wterm.css sets position:relative on .wterm, which defeats inset-0.
     * Force full dimensions of the containing pane so the measured char
     * width isn't based on a collapsed-to-content host.
     */
    width: 100%;
    height: 100%;

    padding: 8px;
    border-radius: 0;
    box-shadow: none;
  }
</style>

{#if sessionId && tabId}
  <div
    class="relative flex h-full min-h-0 flex-1 overflow-hidden rounded-none shadow-none"
    style:background={TERMINAL_BACKGROUND}
  >
    <!--
      wterm's .wterm sets position:relative, so the host needs explicit
      100% width + height to fill this pane. Without them it collapses
      to content width (~62px / ~4 cols) and the Go PTY gets cols=4.
    -->
    <div
      bind:this={terminalElement}
      class="wterm-host absolute inset-0 h-full w-full"
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
