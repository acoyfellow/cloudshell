/**
 * GET /api/mcp/oauth/callback?state=...&code=...
 *
 * Browser lands here after the user approves (or declines) the OAuth
 * flow at the upstream MCP server. Behaviour:
 *   1. Validate Better Auth session (the popup inherits cookies from
 *      the opener window, which is the signed-in cloudshell.coey.dev).
 *   2. Forward state + code to the Worker; Worker drives the MCP SDK's
 *      auth() helper to complete the exchange and persist tokens.
 *   3. Render a closeable HTML popup that postMessages the outcome
 *      back to the opener window (the cloudshell UI) and auto-closes.
 *
 * Shape copied from Executor's popup pattern
 * (packages/plugins/oauth2/src/http.ts) — dependency-free HTML,
 * postMessage + BroadcastChannel fallback, safe JSON-in-script
 * escaping, dark-mode via prefers-color-scheme, auto-close after
 * a short grace period.
 */

import { error } from '@sveltejs/kit';
import { proxyWorkerRequest } from '$lib/server/worker';
import type { RequestHandler } from './$types';

const POPUP_CHANNEL = 'cloudshell-mcp-oauth';

interface PopupPayload {
  readonly ok: boolean;
  readonly serverUrl?: string;
  readonly error?: string;
}

export const GET: RequestHandler = async (event) => {
  const state = event.url.searchParams.get('state')?.trim();
  const code = event.url.searchParams.get('code')?.trim();
  const oauthError = event.url.searchParams.get('error')?.trim();
  const errorDescription = event.url.searchParams.get('error_description')?.trim();

  // Upstream provider redirected with an error. Render it back to the
  // opener without hitting the Worker.
  if (oauthError) {
    return new Response(popupDocument({ ok: false, error: errorDescription || oauthError }), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  if (!state || !code) {
    throw error(400, 'state and code are required');
  }

  const redirectUrl = new URL('/api/mcp/oauth/callback', event.url.origin).toString();

  const workerRequest = new Request(event.request.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state, code, redirectUrl }),
  });
  const rewrappedEvent = { ...event, request: workerRequest } as typeof event;

  try {
    const response = await proxyWorkerRequest(rewrappedEvent, '/mcp/oauth/callback');
    if (!response.ok) {
      const text = await response.text().catch(() => 'Worker error');
      return new Response(popupDocument({ ok: false, error: text.slice(0, 500) }), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    const data = (await response.json()) as { status: string; serverUrl?: string };
    return new Response(
      popupDocument({ ok: true, serverUrl: data.serverUrl ?? '' }),
      { headers: { 'content-type': 'text/html; charset=utf-8' } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(popupDocument({ ok: false, error: message }), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
};

// ---------------------------------------------------------------------------
// Popup document — intentionally dependency-free. Shape adapted from
// Executor's OAuth popup; kept minimal (no external fonts, no external
// icon libs) so the popup renders even if the opener has aggressive
// connection pooling or rate limits.
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Serialize a value for embedding inside a `<script>` tag. Escapes
 * characters that could prematurely terminate the script so an
 * attacker-controlled error field can't break out of the script
 * context. Do not remove without replacing with an equivalent.
 */
function serializeForScript(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}

function popupDocument(payload: PopupPayload): string {
  const serialized = serializeForScript(payload);
  const title = payload.ok ? 'Connected' : 'Connection failed';
  const message = payload.ok
    ? payload.serverUrl
      ? `Connected to ${payload.serverUrl}. You can close this window.`
      : 'Authentication complete. This window will close automatically.'
    : payload.error || 'The connection could not be completed.';
  const statusColor = payload.ok ? '#22c55e' : '#ef4444';
  const icon = payload.ok
    ? '<path d="M6 10l3 3 5-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    : '<path d="M7 7l6 6M13 7l-6 6" stroke="white" stroke-width="2" stroke-linecap="round"/>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fafafa;color:#111">
<style>@media(prefers-color-scheme:dark){body{background:#09090b!important;color:#fafafa!important}p{color:#a1a1aa!important}}</style>
<main style="text-align:center;max-width:360px;padding:24px">
<div style="width:40px;height:40px;border-radius:50%;background:${statusColor};margin:0 auto 16px;display:flex;align-items:center;justify-content:center">
<svg width="20" height="20" viewBox="0 0 20 20" fill="none">${icon}</svg>
</div>
<h1 style="margin:0 0 8px;font-size:18px;font-weight:600">${escapeHtml(title)}</h1>
<p style="margin:0;font-size:14px;color:#666;line-height:1.5">${escapeHtml(message)}</p>
</main>
<script>
(()=>{
  const p=${serialized};
  try{
    if(window.opener){
      window.opener.postMessage({source:'cloudshell-mcp-oauth',payload:p},window.location.origin);
    }
    if('BroadcastChannel' in window){
      const c=new BroadcastChannel(${JSON.stringify(POPUP_CHANNEL)});
      c.postMessage(p);
      setTimeout(()=>c.close(),100);
    }
  }finally{
    setTimeout(()=>window.close(),250);
  }
})();
</script>
</body></html>`;
}
