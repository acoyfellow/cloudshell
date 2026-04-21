/**
 * cloudterm renderer adapter. Experimental.
 *
 * Opt in with `?renderer=cloudterm`. If cloudterm breaks, xterm is
 * still the default and unaffected. See renderers/types.ts for the
 * contract this file implements.
 */

import type { RendererFactory, RendererOptions, TerminalRenderer } from './types';

const TERMINAL_BACKGROUND = '#000000';

export const createCloudtermRenderer: RendererFactory = async (
  opts: RendererOptions
): Promise<TerminalRenderer> => {
  const [{ mount }] = await Promise.all([import('cloudterm')]);
  // Cloudterm ships its own styles; terminal-pane.svelte imports
  // 'cloudterm/style.css' unconditionally so both renderers share
  // a consistent bundle shape.

  const term = await mount(opts.host, {
    onData: (bytes: Uint8Array) => opts.onData(bytes),
    onResize: (cols: number, rows: number) => opts.onResize(cols, rows),
    onTitle: opts.onTitle ? (title: string) => opts.onTitle?.(title) : undefined,
    theme: {
      background: TERMINAL_BACKGROUND,
      foreground: '#f2efe8',
      cursor: '#f7f4ed',
      fontFamily: '"IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace',
      fontSize: 13,
    },
    maxScrollback: 10_000,
  });

  return {
    write(data: Uint8Array) {
      term.write(data);
    },
    clear() {
      // Cloudterm does not expose an explicit clear() in v0.0.3. The
      // ESC c (RIS, full reset) sequence asks the emulator to reset
      // its state, which produces a clean screen on reconnect.
      term.write(new Uint8Array([0x1b, 0x63]));
    },
    fit() {
      try {
        term.fit();
      } catch {
        // Match xterm adapter: swallow transient layout errors.
      }
    },
    focus() {
      term.focus();
    },
    destroy() {
      term.destroy();
    },
    get cols() {
      return term.cols;
    },
    get rows() {
      return term.rows;
    },
  };
};
