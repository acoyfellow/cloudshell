#!/usr/bin/env node
/**
 * `mcp` — cloudshell's zero-dep Model Context Protocol client.
 *
 * This CLI runs inside a cloudshell container. It authenticates to the
 * cloudshell app via a bridge ticket (see
 * src/lib/server/mcp-bridge-auth.ts) and delegates all tool calls to
 * the app's /api/mcp/bridge proxy, which attaches the upstream OAuth
 * token server-side. The container never holds an MCP access token.
 *
 * Commands:
 *   mcp login <server>              — print auth URL, poll for completion
 *   mcp list                        — list connected MCP servers
 *   mcp call <server> <method> [args]  — send an MCP JSON-RPC call
 *   mcp whoami                      — show ticket identity + expiry
 *   mcp help                        — show this help
 *
 * Ticket resolution (in order):
 *   1. $CLOUDSHELL_BRIDGE_TICKET environment variable
 *   2. ~/.cloudshell/bridge-ticket file (first line)
 *
 * When no ticket is available, the CLI prints instructions for how to
 * obtain one. Automatic ticket delivery from the app UI (A.6b) lands
 * in a later commit.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Buffer } from 'node:buffer';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default bridge origin. Override with $CLOUDSHELL_BRIDGE_URL. */
const DEFAULT_BRIDGE_URL = 'https://cloudshell.coey.dev';
const POLL_INTERVAL_MS = 2_000;
const LOGIN_TIMEOUT_MS = 10 * 60 * 1_000; // 10 minutes

function getBridgeUrl() {
  const explicit = process.env.CLOUDSHELL_BRIDGE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  return DEFAULT_BRIDGE_URL;
}

// ---------------------------------------------------------------------------
// Ticket resolution
// ---------------------------------------------------------------------------

function getTicketPath() {
  return path.join(os.homedir(), '.cloudshell', 'bridge-ticket');
}

function readTicket() {
  const fromEnv = process.env.CLOUDSHELL_BRIDGE_TICKET?.trim();
  if (fromEnv) return fromEnv;

  const filePath = getTicketPath();
  try {
    const contents = fs.readFileSync(filePath, 'utf8').trim();
    if (contents) return contents;
  } catch {
    // not present
  }
  return null;
}

function requireTicket() {
  const ticket = readTicket();
  if (!ticket) {
    console.error(
      [
        'No cloudshell bridge ticket found.',
        '',
        'To obtain one, visit the cloudshell UI and click',
        '"Connect MCP" for any server (A.7 feature). The ticket will',
        'be written to ~/.cloudshell/bridge-ticket automatically.',
        '',
        'Alternatively, paste a ticket from your session:',
        '  mkdir -p ~/.cloudshell',
        '  echo "<ticket>" > ~/.cloudshell/bridge-ticket',
        '',
        'Or set the environment variable:',
        '  export CLOUDSHELL_BRIDGE_TICKET=<ticket>',
      ].join('\n')
    );
    process.exit(2);
  }
  return ticket;
}

// ---------------------------------------------------------------------------
// HTTP helpers (Node 18+ has global fetch — no deps)
// ---------------------------------------------------------------------------

async function bridgeFetch(path, init = {}) {
  const ticket = requireTicket();
  const url = new URL(path, getBridgeUrl()).toString();
  const headers = new Headers(init.headers || {});
  headers.set('X-Cloudshell-Ticket', ticket);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return fetch(url, { ...init, headers });
}

async function jsonOrThrow(response, context) {
  if (response.ok) {
    const ct = response.headers.get('content-type') || '';
    return ct.includes('application/json')
      ? await response.json()
      : await response.text();
  }
  const bodyText = await response.text().catch(() => '');
  throw new Error(
    `${context}: HTTP ${response.status} ${response.statusText}${
      bodyText ? ` — ${bodyText.slice(0, 400)}` : ''
    }`
  );
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdLogin(serverUrl) {
  if (!serverUrl) {
    console.error('Usage: mcp login <server-url>');
    process.exit(1);
  }
  // Pre-auth check — make sure we have a ticket before trying to
  // read the current connections list.
  requireTicket();

  // Is it already connected?
  const { connections } = await jsonOrThrow(
    await bridgeFetch('/api/mcp/connections'),
    'Failed to fetch connections'
  );
  const existing = (connections || []).find((c) => c.serverId === serverUrl);
  if (existing) {
    console.log(`Already connected to ${serverUrl} (since ${new Date(existing.connectedAt).toISOString()}).`);
    return;
  }

  // Ask the cloudshell app to start an OAuth flow. This returns an
  // authorize URL the user must open in THEIR browser (not the
  // container's — there is no browser in the container). The user
  // signs in to cloudshell if not already, approves on the MCP
  // provider's consent page, and a callback writes the token to
  // the user's DO.
  const start = await jsonOrThrow(
    await bridgeFetch('/api/mcp/oauth/start-from-cli', {
      method: 'POST',
      body: JSON.stringify({ serverUrl }),
    }),
    'Failed to initiate OAuth'
  );
  if (start.status === 'already_connected') {
    console.log(`Already connected to ${serverUrl}.`);
    return;
  }
  if (start.status !== 'redirect' || !start.authorizeUrl) {
    throw new Error(
      `Unexpected start response: ${JSON.stringify(start).slice(0, 400)}`
    );
  }

  console.log(`Open this URL in your browser to authorize ${serverUrl}:`);
  console.log('');
  console.log(`  ${start.authorizeUrl}`);
  console.log('');
  console.log('Waiting for authorization... (Ctrl-C to cancel)');

  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const poll = await jsonOrThrow(
      await bridgeFetch('/api/mcp/connections'),
      'Failed to poll connections'
    );
    const now = (poll.connections || []).find((c) => c.serverId === serverUrl);
    if (now) {
      console.log('');
      console.log(`✓ Connected to ${serverUrl}.`);
      return;
    }
  }
  console.log('');
  console.error(
    `Timed out waiting for authorization after ${LOGIN_TIMEOUT_MS / 60_000} minutes.`
  );
  process.exit(1);
}

async function cmdList() {
  const data = await jsonOrThrow(
    await bridgeFetch('/api/mcp/connections'),
    'Failed to fetch connections'
  );
  const list = data.connections || [];
  if (!list.length) {
    console.log('No MCP servers connected. Use `mcp login <url>` to add one.');
    return;
  }
  for (const c of list) {
    const when = new Date(c.connectedAt).toISOString();
    console.log(`${c.serverId}\t${when}`);
  }
}

/**
 * MCP Streamable HTTP session handshake.
 *
 * Per MCP spec, stateful servers (like cf-portal) reject arbitrary
 * method calls without a prior `initialize`. The flow:
 *   1. POST `initialize` → server returns `Mcp-Session-Id: <sid>` header
 *   2. (optional but polite) POST `notifications/initialized` with the sid
 *   3. POST further methods, each with `Mcp-Session-Id` header
 *
 * Without this, cf-portal returns a JSON-RPC error like:
 *   {code:-32000, message:"Bad Request: Session expired or does not exist"}
 *
 * Sessions expire server-side. For a CLI one-shot call we don't cache
 * the sid; every invocation does its own handshake. Cheap (a few
 * hundred ms) and correct.
 */
async function mcpHandshake(serverUrl) {
  const bridgePath = `/api/mcp/bridge/mcp?server=${encodeURIComponent(
    serverUrl
  )}`;
  const initRpc = {
    jsonrpc: '2.0',
    id: `cli-init-${Date.now()}`,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'cloudshell-mcp-cli', version: '0.1' },
    },
  };
  const response = await bridgeFetch(bridgePath, {
    method: 'POST',
    headers: { accept: 'application/json, text/event-stream' },
    body: JSON.stringify(initRpc),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `initialize failed: HTTP ${response.status}${
        text ? ` — ${text.slice(0, 400)}` : ''
      }`
    );
  }
  const sessionId = response.headers.get('mcp-session-id');
  if (!sessionId) {
    // Stateless transport — no handshake needed, caller can just POST
    // normally. Return null so cmdCall falls back to one-shot mode.
    // Drain the body so the connection is clean.
    try {
      await response.arrayBuffer();
    } catch {
      // ignore
    }
    return null;
  }
  // Drain the initialize response (we don't inspect capabilities here —
  // cf-portal's tools/list is what the user asked for).
  await consumeResponse(response);

  // Polite `notifications/initialized` (no id, no response expected).
  try {
    await bridgeFetch(bridgePath, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });
  } catch {
    // Best-effort — server might respond 202 or nothing; fine either way.
  }
  return sessionId;
}

/**
 * Drain a response body without caring about the content — used after
 * initialize so we don't leak the connection but don't need to parse
 * the body (we only needed the session id header).
 */
async function consumeResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      // ignore
    }
  } else {
    try {
      await response.arrayBuffer();
    } catch {
      // ignore
    }
  }
}

async function cmdCall(serverUrl, method, ...paramArgs) {
  if (!serverUrl || !method) {
    console.error('Usage: mcp call <server-url> <method> [<json-params>]');
    process.exit(1);
  }
  const params =
    paramArgs.length === 0 ? undefined : JSON.parse(paramArgs.join(' '));

  // Establish a session first (stateful MCP transport). If the server
  // is stateless, sessionId is null and we call directly.
  const sessionId = await mcpHandshake(serverUrl);

  const rpc = {
    jsonrpc: '2.0',
    id: `cli-${Date.now()}`,
    method,
    ...(params !== undefined ? { params } : {}),
  };

  const bridgePath = `/api/mcp/bridge/mcp?server=${encodeURIComponent(
    serverUrl
  )}`;

  const headers = { accept: 'application/json, text/event-stream' };
  if (sessionId) headers['mcp-session-id'] = sessionId;

  const response = await bridgeFetch(bridgePath, {
    method: 'POST',
    headers,
    body: JSON.stringify(rpc),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `HTTP ${response.status} ${response.statusText}${
        text ? ` — ${text.slice(0, 800)}` : ''
      }`
    );
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    // Stream SSE events to stdout as they arrive.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      process.stdout.write(decoder.decode(value, { stream: true }));
    }
    return;
  }

  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  process.stdout.write(
    typeof body === 'string' ? body : JSON.stringify(body, null, 2) + '\n'
  );
}

function cmdWhoami() {
  const ticket = readTicket();
  if (!ticket) {
    console.error('No ticket configured. Run `mcp help` for ticket setup.');
    process.exit(2);
  }
  // Capability tickets are `<base64url-payload>.<base64url-signature>`.
  // Read and display payload only; never print the signature.
  const [payloadB64] = ticket.split('.');
  if (!payloadB64) {
    console.error('Ticket does not parse; refresh required.');
    process.exit(2);
  }
  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    );
    const expDate = new Date(payload.exp);
    console.log(`User:    ${payload.userId}`);
    console.log(`Email:   ${payload.userEmail ?? '(none)'}`);
    console.log(`Scope:   ${(payload.scope || []).join(',')}`);
    console.log(`Expires: ${expDate.toISOString()} (${timeUntil(expDate)})`);
  } catch (e) {
    console.error('Ticket payload unreadable:', e.message);
    process.exit(2);
  }
}

function cmdHelp() {
  console.log(`mcp — cloudshell's MCP client

  mcp login <server>              — open browser to authorize an MCP server
  mcp list                        — list connected MCP servers
  mcp call <server> <method> [p]  — send an MCP JSON-RPC call
  mcp whoami                      — show ticket identity + expiry
  mcp help                        — show this help

Environment:
  CLOUDSHELL_BRIDGE_URL           default: ${DEFAULT_BRIDGE_URL}
  CLOUDSHELL_BRIDGE_TICKET        bridge ticket (optional; ~/.cloudshell/bridge-ticket fallback)

All tool calls route through ${getBridgeUrl()}/api/mcp/bridge. The
upstream OAuth access token for each server never enters this
container — the cloudshell app holds it and attaches it server-side.
`);
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function timeUntil(date) {
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return 'expired';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  return `in ${hours}h${mins % 60 ? ` ${mins % 60}m` : ''}`;
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'login':
      await cmdLogin(rest[0]);
      break;
    case 'list':
      await cmdList();
      break;
    case 'call':
      await cmdCall(...rest);
      break;
    case 'whoami':
      cmdWhoami();
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      cmdHelp();
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      cmdHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
