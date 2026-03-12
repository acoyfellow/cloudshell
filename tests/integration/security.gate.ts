import { Gate, Act, Assert } from "gateproof";

/**
 * Health check gate
 * Verifies the /health endpoint returns status: ok
 */
export const healthGate = Gate.define({
  id: "health-check",
  name: "Health Endpoint Check",
  observe: {
    type: "http",
    url: "http://localhost:8787/health",
  },
  act: [Act.fetch()],
  assert: [
    Assert.status(200),
    Assert.json({ status: "ok" }),
    Assert.noErrors(),
  ],
});

/**
 * Root endpoint gate
 * Verifies the main page loads with security headers
 */
export const rootGate = Gate.define({
  id: "root-endpoint",
  name: "Root Page Load",
  observe: {
    type: "http",
    url: "http://localhost:8787/",
  },
  act: [Act.fetch()],
  assert: [
    Assert.status(200),
    Assert.header("Content-Security-Policy"),
    Assert.header("X-Frame-Options", "DENY"),
    Assert.header("X-Content-Type-Options", "nosniff"),
    Assert.noErrors(),
  ],
});

/**
 * CSWSH Protection gate
 * Verifies invalid origins are rejected
 */
export const cswshGate = Gate.define({
  id: "cswsh-protection",
  name: "CSWSH Origin Validation",
  observe: {
    type: "http",
    url: "http://localhost:8787/ws/terminal",
    headers: {
      Origin: "https://evil.com",
      Upgrade: "websocket",
    },
  },
  act: [Act.fetch()],
  assert: [
    Assert.status(403),
    Assert.noErrors(),
  ],
});

/**
 * Rate limiting gate
 * Verifies rate limiting is enforced
 */
export const rateLimitGate = Gate.define({
  id: "rate-limit",
  name: "Rate Limiting",
  observe: {
    type: "http",
    url: "http://localhost:8787/health",
  },
  act: [
    // Send 35 requests rapidly
    ...Array(35).fill(Act.fetch()),
  ],
  assert: [
    // Some should be rate limited (429)
    Assert.status(429, { atLeast: 1 }),
    Assert.noErrors(),
  ],
});

/**
 * Input validation gate
 * Verifies invalid sandbox IDs are rejected
 */
export const inputValidationGate = Gate.define({
  id: "input-validation",
  name: "Input Validation",
  observe: {
    type: "http",
    url: "http://localhost:8787/ws/terminal?id=invalid;rm -rf /",
    headers: {
      Upgrade: "websocket",
    },
  },
  act: [Act.fetch()],
  assert: [
    Assert.status(400),
    Assert.noErrors(),
  ],
});
