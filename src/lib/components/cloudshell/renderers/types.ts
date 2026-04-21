/**
 * Renderer adapter interface for cloudshell's terminal pane.
 *
 * The terminal component (terminal-pane.svelte) owns the WebSocket,
 * reconnect logic, control-message plumbing, and ticket delivery. The
 * renderer adapter owns only the on-screen terminal grid: mounting it
 * into a DOM host, writing PTY bytes, surfacing keyboard input, and
 * reporting grid dimensions on resize.
 *
 * Two implementations live alongside this file:
 *   - xterm.ts:     default, xterm.js DOM renderer (current behavior)
 *   - cloudterm.ts: experimental, github:acoyfellow/cloudterm
 */

export interface TerminalRenderer {
  /** Write PTY bytes into the on-screen grid. */
  write(data: Uint8Array): void;

  /** Clear the on-screen grid (used on reconnect). */
  clear(): void;

  /** Refit the grid to the current host size and report cols/rows. */
  fit(): void;

  /** Move keyboard focus into the terminal. */
  focus(): void;

  /** Tear everything down and release listeners / DOM. */
  destroy(): void;

  /** Current column count. */
  readonly cols: number;

  /** Current row count. */
  readonly rows: number;
}

export interface RendererOptions {
  /** DOM element the renderer should mount into. */
  host: HTMLElement;

  /** Keyboard input leaving the terminal, destined for the PTY. */
  onData: (bytes: Uint8Array) => void;

  /** Grid was resized; forward cols/rows to the PTY. */
  onResize: (cols: number, rows: number) => void;

  /** Optional OSC 2 / OSC 0 title updates. */
  onTitle?: (title: string) => void;
}

export type RendererFactory = (opts: RendererOptions) => Promise<TerminalRenderer>;

export type RendererId = 'xterm' | 'cloudterm';

const VALID_RENDERERS = new Set<RendererId>(['xterm', 'cloudterm']);

/**
 * Resolve the renderer id from a URL query value.
 *
 * Anything other than a known non-default renderer collapses to
 * 'xterm' so a typo (or a future renderer someone didn't ship yet)
 * never breaks the daily-driver xterm path.
 */
export function resolveRendererId(raw: string | null | undefined): RendererId {
  if (!raw) return 'xterm';
  const value = raw.trim().toLowerCase();
  if (VALID_RENDERERS.has(value as RendererId)) {
    return value as RendererId;
  }
  return 'xterm';
}
