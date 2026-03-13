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

// Basic auth middleware - credentials required (set via wrangler secrets)
app.use("*", async (c, next) => {
  const validUser = c.env.AUTH_USERNAME;
  const validPass = c.env.AUTH_PASSWORD;

  if (!validUser || !validPass) {
    return new Response("Server misconfigured: Set AUTH_USERNAME and AUTH_PASSWORD secrets", { status: 500 });
  }

  const auth = c.req.header("Authorization");
  if (!auth) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="CloudShell"' },
    });
  }

  const [scheme, encoded] = auth.split(" ");
  if (scheme !== "Basic" || !encoded) {
    return new Response("Bad Request", { status: 400 });
  }

  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  const [username, password] = decoded.split(":");

  if (username !== validUser || password !== validPass) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="CloudShell"' },
    });
  }

  await next();
});

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
