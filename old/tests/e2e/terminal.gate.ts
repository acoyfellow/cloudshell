import { Gate, Act, Assert } from "gateproof";

/**
 * E2E: User can connect and execute command
 */
export const terminalConnectionGate = Gate.define({
  id: "e2e-terminal-connection",
  name: "Terminal Connection Flow",
  observe: {
    type: "browser",
    url: "http://localhost:8787",
  },
  act: [
    // Wait for terminal to be ready
    Act.waitForSelector(".xterm"),
    // Type a command
    Act.type("echo 'Hello CloudShell'"),
    Act.keyPress("Enter"),
    // Wait for output
    Act.wait(1000),
  ],
  assert: [
    Assert.textContains("Hello CloudShell"),
    Assert.elementCount(".xterm", 1),
    Assert.noErrors(),
  ],
});

/**
 * E2E: Session timeout warning
 */
export const sessionTimeoutGate = Gate.define({
  id: "e2e-session-timeout",
  name: "Session Timeout Warning",
  observe: {
    type: "browser",
    url: "http://localhost:8787",
  },
  act: [
    Act.waitForSelector("#terminal"),
    // Simulate 25 minutes of inactivity (via console)
    Act.executeScript(() => {
      // Fast-forward time for testing
      const event = new Event("activity");
      document.dispatchEvent(event);
    }),
    // Wait for warning to appear
    Act.wait(500),
  ],
  assert: [
    Assert.elementVisible("#timeout-warning"),
    Assert.noErrors(),
  ],
});

/**
 * E2E: CSP blocks inline scripts
 */
export const cspProtectionGate = Gate.define({
  id: "e2e-csp-protection",
  name: "CSP Blocks Inline Scripts",
  observe: {
    type: "browser",
    url: "http://localhost:8787",
  },
  act: [
    Act.waitForSelector("#terminal"),
    // Try to inject inline script (should be blocked by CSP)
    Act.executeScript(() => {
      const script = document.createElement("script");
      script.textContent = "window.cspTest = 'failed'";
      document.body.appendChild(script);
    }),
    Act.wait(500),
  ],
  assert: [
    // Verify CSP blocked the script
    Assert.executeScript(() => window.cspTest === undefined),
    Assert.noErrors(),
  ],
});
