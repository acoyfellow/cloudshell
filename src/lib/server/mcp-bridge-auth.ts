/**
 * APP-side bridge ticket verification. Factored out so every MCP
 * broker endpoint that's called by the container (not the browser)
 * validates in the same shape.
 *
 * Called by:
 *   - /api/mcp/connections        (list connected MCP servers)
 *   - /api/mcp/bridge/[...path]   (tool invocation proxy) — lands in A.5
 *
 * Contract:
 *   - Requires `X-Cloudshell-Ticket: <ticket>` on the incoming request.
 *   - Ticket must verify against TERMINAL_TICKET_SECRET (same secret
 *     as the other tickets; scope is how we distinguish).
 *   - Ticket must carry scope `['mcp-bridge']` — Better Auth session
 *     tickets and terminal-WS tickets MUST NOT validate here.
 *
 * Returns the verified userId for the caller to feed the Worker via
 * the standard X-User-Id header forwarding.
 */

import { error, type RequestEvent } from '@sveltejs/kit';
import { verifyCapabilityTicket } from '../../../shared/terminal-ticket';

export const BRIDGE_SCOPE = 'mcp-bridge';

export async function verifyBridgeTicket(event: RequestEvent): Promise<{
  userId: string;
  userEmail: string | null;
}> {
  const ticket = event.request.headers.get('X-Cloudshell-Ticket');
  if (!ticket) {
    throw error(401, 'X-Cloudshell-Ticket header is required');
  }

  const secret =
    event.platform?.env?.TERMINAL_TICKET_SECRET ||
    event.platform?.env?.BETTER_AUTH_SECRET;
  if (!secret) {
    throw error(500, 'Ticket secret is not configured');
  }

  const verified = await verifyCapabilityTicket(ticket, secret, BRIDGE_SCOPE);
  if (!verified) {
    throw error(401, 'Invalid or expired bridge ticket');
  }

  return {
    userId: verified.userId,
    userEmail: verified.userEmail,
  };
}
