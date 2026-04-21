import type { RendererFactory, RendererId } from './types';

export type { RendererFactory, RendererId, RendererOptions, TerminalRenderer } from './types';
export { resolveRendererId } from './types';

/**
 * Map a renderer id to its factory. Factories are code-split via
 * dynamic import so the cloudterm bundle is only fetched when a user
 * explicitly opts in with `?renderer=cloudterm`.
 */
export function getRendererFactory(id: RendererId): Promise<RendererFactory> {
  if (id === 'cloudterm') {
    return import('./cloudterm').then((m) => m.createCloudtermRenderer);
  }
  return import('./xterm').then((m) => m.createXtermRenderer);
}
