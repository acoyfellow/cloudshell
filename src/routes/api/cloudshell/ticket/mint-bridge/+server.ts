/**
 * POST /api/cloudshell/ticket/mint-bridge
 *
 * Mint a short-lived, scoped capability ticket the container can use
 * to authenticate itself against the MCP broker endpoints. The CLI in
 * the container sends this as `X-Cloudshell-Ticket: <ticket>` on every
 * `/api/mcp/connections` and `/api/mcp/bridge/*` call.
 *
 * Trust model:
 *   - This endpoint requires a valid Better Auth session. Only a
 *     signed-in user can mint a ticket for themselves.
 *   - The ticket is scoped `['mcp-bridge']`; it CANNOT be used for the
 *     terminal-WS path (which validates identity tickets without scope).
 *   - Short TTL (1 hour) bounds the blast radius if leaked. The CLI
 *     refreshes by calling this endpoint again — which requires the
 *     user's browser session to still be alive.
 *   - `userId` is pinned at mint time. If the user signs out, future
 *     mints fail; existing tickets remain valid until exp. That's
 *     acceptable for a 1-hour window.
 *
 * Response: { ticket: string, expiresAt: number } (expiresAt is ms UTC)
 */

import { error, json } from '@sveltejs/kit';
import { createCapabilityTicket } from '../../../../../../shared/terminal-ticket';
import type { RequestHandler } from './$types';

const TICKET_TTL_MS = 60 * 60 * 1000; // 1 hour

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  const session = event.locals.session;
  if (!user || !session) {
    throw error(401, 'Authentication required');
  }

  const secret =
    event.platform?.env?.TERMINAL_TICKET_SECRET ||
    event.platform?.env?.BETTER_AUTH_SECRET;
  if (!secret) {
    throw error(500, 'Ticket secret is not configured');
  }

  const expiresAt = Date.now() + TICKET_TTL_MS;

  const ticket = await createCapabilityTicket(
    {
      userId: user.id,
      userEmail: user.email ?? null,
      // sessionId/tabId are meaningless for a bridge ticket, but the
      // underlying payload requires them. Use stable sentinels so
      // verification code can tell bridge tickets from terminal ones
      // by `scope` (not by these fields).
      sessionId: 'bridge',
      tabId: 'bridge',
      exp: expiresAt,
      scope: ['mcp-bridge'],
    },
    secret
  );

  return json({ ticket, expiresAt });
};
