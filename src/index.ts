import { Hono } from "hono";
import { getSandbox } from "@cloudflare/sandbox";
import { html } from "./shell";
import type { Env } from "./types";
import {
  validateOrigin,
  securityHeaders,
  rateLimit,
  validateInput,
  checkSessionTimeout,
  validateSandboxId,
  createSession,
} from "./security";

export { Sandbox } from "@cloudflare/sandbox";

const app = new Hono<{ Bindings: Env; Variables: { nonce: string } }>();

/**
 * Apply security middleware to all routes
 */
app.use(securityHeaders);
app.use(rateLimit);
app.use(validateInput);
app.use(checkSessionTimeout);

/**
 * Derive a stable sandbox ID from the authenticated email.
 * One sandbox per user, always the same instance.
 */
function sandboxId(email: string): string {
  return "shell:" + email.toLowerCase().replace(/[^a-z0-9]/g, "-");
}

/**
 * Get the CF Access email from the request.
 * Returns null if not behind Access (shouldn't happen in prod).
 */
function getEmail(c: { req: { header: (name: string) => string | undefined } }): string | null {
  return c.req.header("Cf-Access-Authenticated-User-Email") ?? null;
}

/** Health check */
app.get("/health", (c) => c.json({ status: "ok" }));

/** Main page -- serve the terminal UI */
app.get("/", (c) => {
  const email = getEmail(c) ?? "local@dev";
  const id = sandboxId(email);
  
  // Create session for timeout tracking
  const sessionId = createSession(email, id);
  
  // Get nonce from context (set by securityHeaders middleware)
  const nonce = c.get("nonce");
  
  return c.html(html(email, id, sessionId, nonce));
});

/** Terminal WebSocket endpoint with CSWSH protection */
app.get("/ws/terminal", validateOrigin, async (c) => {
  const upgrade = c.req.header("Upgrade");
  if (upgrade?.toLowerCase() !== "websocket") {
    return c.text("expected websocket", 426);
  }

  const email = getEmail(c) ?? "local@dev";
  const id = c.req.query("id");
  
  // Validate sandbox ID
  if (id && !validateSandboxId(id)) {
    return c.text("Invalid sandbox ID", 400);
  }
  
  const sandboxIdToUse = id ?? sandboxId(email);
  const sandbox = getSandbox(c.env.Sandbox, sandboxIdToUse);

  return sandbox.fetch(c.req.raw);
});

export default app;
