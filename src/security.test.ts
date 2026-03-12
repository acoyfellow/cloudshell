import { describe, it, expect } from "vitest";
import {
  validateSandboxId,
  validateEmail,
  sanitizeTerminalInput,
  generateNonce,
  IDLE_TIMEOUT,
} from "./security";

describe("validateSandboxId", () => {
  it("should accept valid sandbox IDs", () => {
    expect(validateSandboxId("shell:user-example-com")).toBe(true);
    expect(validateSandboxId("shell:test-123")).toBe(true);
    expect(validateSandboxId("shell:abc-def-ghi")).toBe(true);
  });

  it("should reject invalid sandbox IDs", () => {
    expect(validateSandboxId("invalid")).toBe(false);
    expect(validateSandboxId("shell:UPPERCASE")).toBe(false);
    expect(validateSandboxId("shell:underscore_test")).toBe(false);
    expect(validateSandboxId("shell:semicolon;test")).toBe(false);
    expect(validateSandboxId("")).toBe(false);
  });

  it("should prevent command injection attempts", () => {
    expect(validateSandboxId("shell;rm -rf /")).toBe(false);
    expect(validateSandboxId("shell|cat /etc/passwd")).toBe(false);
    expect(validateSandboxId("shell$(whoami)")).toBe(false);
  });
});

describe("validateEmail", () => {
  it("should accept valid emails", () => {
    expect(validateEmail("user@example.com")).toBe(true);
    expect(validateEmail("test.user@domain.co.uk")).toBe(true);
    expect(validateEmail("user+tag@example.com")).toBe(true);
  });

  it("should reject invalid emails", () => {
    expect(validateEmail("not-an-email")).toBe(false);
    expect(validateEmail("@example.com")).toBe(false);
    expect(validateEmail("user@")).toBe(false);
    expect(validateEmail("")).toBe(false);
    expect(validateEmail("user@.com")).toBe(false);
  });
});

describe("sanitizeTerminalInput", () => {
  it("should remove control characters", () => {
    expect(sanitizeTerminalInput("hello\x00world")).toBe("helloworld");
    expect(sanitizeTerminalInput("test\x07beep")).toBe("testbeep");
    expect(sanitizeTerminalInput("test\x7fdel")).toBe("testdel");
  });

  it("should preserve valid characters", () => {
    expect(sanitizeTerminalInput("Hello World 123")).toBe("Hello World 123");
    expect(sanitizeTerminalInput("!@#$%^&*()")).toBe("!@#$%^&*()");
  });

  it("should handle empty strings", () => {
    expect(sanitizeTerminalInput("")).toBe("");
  });
});

describe("generateNonce", () => {
  it("should generate a 32-character hex string", () => {
    const nonce = generateNonce();
    expect(nonce).toHaveLength(32);
    expect(/^[a-f0-9]+$/.test(nonce)).toBe(true);
  });

  it("should generate unique nonces", () => {
    const nonce1 = generateNonce();
    const nonce2 = generateNonce();
    expect(nonce1).not.toBe(nonce2);
  });
});

describe("IDLE_TIMEOUT constant", () => {
  it("should be 30 minutes in milliseconds", () => {
    expect(IDLE_TIMEOUT).toBe(30 * 60 * 1000);
    expect(IDLE_TIMEOUT).toBe(1800000);
  });
});
