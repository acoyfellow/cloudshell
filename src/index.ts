import { Hono } from "hono";
import { Container, getContainer } from "@cloudflare/containers";
import { html } from "./shell";
import type { Env } from "./types";

// Export the Container class for Durable Object binding
export { CloudShellTerminal, TerminalContainer, ShellContainer, CloudShellSandbox };

// Current Container class
class CloudShellTerminal extends Container {
  defaultPort = 8080;
  sleepAfter = '5m';
}

// Legacy classes for backwards compatibility
class TerminalContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '5m';
}

class ShellContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '5m';
}

class CloudShellSandbox extends Container {
  defaultPort = 8080;
  sleepAfter = '5m';
}

const app = new Hono<{ Bindings: Env }>();

function sandboxId(email: string): string {
  return "shell:" + email.toLowerCase().replace(/[^a-z0-9]/g, "-");
}

function getEmail(c: { req: { header: (name: string) => string | undefined } }): string | null {
  return c.req.header("Cf-Access-Authenticated-User-Email") ?? null;
}

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/", (c) => {
  const email = getEmail(c) ?? "local@dev";
  const id = sandboxId(email);
  return c.html(html(email, id));
});

app.get("/ws/terminal", async (c) => {
  const upgrade = c.req.header("Upgrade");
  if (upgrade?.toLowerCase() !== "websocket") {
    return c.text("expected websocket", 426);
  }

  const email = getEmail(c) ?? "local@dev";
  const id = c.req.query("id") ?? sandboxId(email);
  
  // Get the container
  const container = getContainer(c.env.Sandbox, id);
  
  // Start if not running
  const state = await container.getState();
  if (state.status !== 'healthy') {
    await container.start();
  }
  
  // Proxy WebSocket to container
  return container.fetch(c.req.raw);
});

export default app;
