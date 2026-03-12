import { Hono } from "hono";
import { getSandbox } from "@cloudflare/sandbox";
import { html } from "./shell";
import type { Env } from "./types";

export { Sandbox } from "@cloudflare/sandbox";

const app = new Hono<{ Bindings: Env }>();

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
app.get("/health", (c) => c.json({ ok: true }));

/** Main page -- serve the terminal UI */
app.get("/", (c) => {
  const email = getEmail(c) ?? "local@dev";
  const id = sandboxId(email);
  return c.html(html(email, id));
});

/** Terminal WebSocket endpoint */
app.get("/ws/terminal", async (c) => {
  const upgrade = c.req.header("Upgrade");
  if (upgrade?.toLowerCase() !== "websocket") {
    return c.text("expected websocket", 426);
  }

  const email = getEmail(c) ?? "local@dev";
  const id = c.req.query("id") ?? sandboxId(email);
  const sandbox = getSandbox(c.env.Sandbox, id);

  return sandbox.terminal(c.req.raw);
});

export default app;
