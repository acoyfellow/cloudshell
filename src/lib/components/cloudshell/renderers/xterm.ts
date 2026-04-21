/**
 * xterm.js renderer adapter. Default renderer for cloudshell.
 *
 * Behavior here must stay identical to the pre-refactor inline
 * implementation in terminal-pane.svelte. If you need to change how
 * xterm is configured, do it here and nowhere else, and double-check
 * that the change is intentional: this is the daily-driver path.
 */

import type { RendererFactory, RendererOptions, TerminalRenderer } from './types';

const TERMINAL_BACKGROUND = '#000000';

export const createXtermRenderer: RendererFactory = async (opts: RendererOptions): Promise<TerminalRenderer> => {
  // Note: the '@xterm/xterm/css/xterm.css' side-effect import lives in
  // terminal-pane.svelte so it is bundled unconditionally whenever the
  // pane is used, matching the pre-refactor behavior.
  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
  ]);

  const terminal = new Terminal({
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
    // Keep plenty of history for the cf-portal tools/list style
    // output. Default is 1000; a long conversation with an agent
    // easily blows past that.
    scrollback: 10_000,
    // Lets xterm smooth-animate scrollback jumps rather than
    // stuttering a frame at a time.
    smoothScrollDuration: 150,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(opts.host);

  // NOTE ON MOUSE WHEEL:
  // Do NOT install a custom wheel handler here. Cloudshell runs
  // tmux inside the container; when the browser's wheel event
  // reaches xterm, xterm forwards it as an escape sequence to
  // tmux, which (with `set -g mouse on` in ~/.tmux.conf) enters
  // copy mode and scrolls the tmux buffer. That IS the scroll
  // experience.
  //
  // An earlier attempt called terminal.scrollLines() on wheel.
  // That scrolled xterm's scrollback buffer but xterm's buffer
  // is empty because tmux is in alt-screen mode and manages its
  // own scrollback. Wrong layer. Removed.
  //
  // If tmux's mouse mode isn't loading (e.g. ~/.tmux.conf missing),
  // fix at the config layer, not with a JS handler.

  const encoder = new TextEncoder();
  terminal.onData((data: string) => {
    opts.onData(encoder.encode(data));
  });

  terminal.onResize(({ cols, rows }) => {
    opts.onResize(cols, rows);
  });

  if (opts.onTitle) {
    terminal.onTitleChange((title: string) => {
      opts.onTitle?.(title);
    });
  }

  return {
    write(data: Uint8Array) {
      terminal.write(data);
    },
    clear() {
      terminal.clear();
    },
    fit() {
      try {
        fitAddon.fit();
      } catch {
        // xterm can throw during rapid layout changes while the DOM is settling.
      }
    },
    focus() {
      terminal.focus();
    },
    destroy() {
      terminal.dispose();
    },
    get cols() {
      return terminal.cols;
    },
    get rows() {
      return terminal.rows;
    },
  };
};
