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

      console.log('[terminal] connecting', { sequence, url: payload.url, mode: payload.mode });
      const nextSocket = new WebSocket(payload.url);
      nextSocket.binaryType = 'arraybuffer';
      nextSocket.onopen = () => {
        console.log('[terminal] socket open', { sequence });
        if (sequence !== reconnectSequence) {
          nextSocket.close();
          return;
        }

        socket = nextSocket;
        lastResizeKey = '';
        controller.setTerminalStatus('connected');
        scheduleTerminalFit();
        scheduleTerminalFit(120);
      };
      nextSocket.onmessage = (event) => {
        if (sequence !== reconnectSequence) {
          return;
        }

        console.log('[terminal] socket message', {
          sequence,
          kind: typeof event.data,
          size: event.data instanceof ArrayBuffer ? event.data.byteLength : String(event.data).length,
        });
        writeTerminalPayload(event.data);
      };
      nextSocket.onerror = () => {
        console.log('[terminal] socket error', { sequence });
        if (sequence === reconnectSequence) {
          controller.setTerminalStatus('disconnected', 'Unable to reach the terminal runtime.');
        }
      };
      nextSocket.onclose = (ev) => {
        console.log('[terminal] socket close', { sequence, code: ev.code, reason: ev.reason, wasClean: ev.wasClean });
        if (sequence === reconnectSequence) {
          const detail =
            ev.code === 1000
              ? 'Terminal connection closed.'
              : `Terminal connection closed (code ${ev.code}${ev.reason ? `: ${ev.reason}` : ''}).`;
          controller.setTerminalStatus('disconnected', detail);
        }
      };
    } catch (error) {
      const message = (error as Error).message || 'Unable to create terminal connection';
      if (sequence === reconnectSequence) {
        controller.setTerminalStatus('disconnected', message);
        terminal.writeln(`\r\n[terminal unavailable] ${message}`);
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

    resizeObserver = new ResizeObserver(() => {
      scheduleTerminalFit();
    });
    resizeObserver.observe(terminalElement!);

    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', resize);
    disposeResize = () => {
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', resize);
      resizeObserver?.disconnect();
      resizeObserver = null;
    };

    await reconnectTerminal();
  }

  onMount(() => {
    if (!sessionId || !tabId) {
      return;
    }

    void initializeTerminal();

    return () => {
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
