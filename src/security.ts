import type { Context, Next } from "hono";
import type { Env } from "./types";

/**
 * Security constants
 */
export const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes

/**
 * Allowed origins for WebSocket connections (CSWSH protection)
 * In production, this should be your actual domain
 */
const ALLOWED_ORIGINS = [
  "http://localhost:8787",
  "http://localhost:3000",
  "https://cloudshell.workers.dev",
  "https://cloudshell.coy.workers.dev",
  "https://cloudshell.coey.dev",
  // Add your custom domain here
];

/**
 * Generate a cryptographically secure nonce for CSP
 */
export function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * CSWSH Protection: Validate WebSocket Origin
 * Returns 403 for invalid origins
 */
export async function validateOrigin(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
  const origin = c.req.header("Origin");
  
  // Allow requests with no origin (same-origin, curl, etc.)
  if (!origin) {
    return await next();
  }
  
  // Check if origin is allowed
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return c.text("Invalid origin", 403);
  }
  
  return await next();
}

/**
 * CSP Headers Middleware
 * Generates nonce and sets strict CSP headers
 */
export async function securityHeaders(c: Context, next: Next): Promise<void> {
  // Set security headers - simplified CSP for xterm from unpkg
  c.header("Content-Security-Policy",
    `default-src 'self'; ` +
    `script-src 'self' 'unsafe-inline' https://unpkg.com; ` +
    `style-src 'self' 'unsafe-inline' https://unpkg.com; ` +
    `connect-src 'self' wss: https:; ` +
    `img-src 'self' data: https:; ` +
    `font-src 'self' https:; ` +
    `frame-ancestors 'none'; ` +
    `base-uri 'self'; ` +
    `form-action 'self';`
  );
  
  c.header("X-Frame-Options", "DENY");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "interest-cohort=()");
  
  await next();
}

/**
 * Rate limiting store
 * Maps IP to { count, resetTime }
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Rate Limiting Middleware
 * 10 req/min for WebSocket, 30 req/min for HTTP
 */
export async function rateLimit(c: Context, next: Next): Promise<Response | void> {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const isWebSocket = c.req.header("Upgrade")?.toLowerCase() === "websocket";
  const limit = isWebSocket ? 10 : 30;
  const windowMs = 60 * 1000; // 1 minute
  
  const now = Date.now();
  const record = rateLimitStore.get(ip);
  
  if (!record || now > record.resetTime) {
    // New window
    rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs });
  } else {
    // Existing window
    record.count++;
    if (record.count > limit) {
      return c.text("Too Many Requests", 429);
    }
  }
  
  return await next();
}

/**
 * Input validation functions
 */
export function validateSandboxId(id: string): boolean {
  // Must match pattern: shell:[a-z0-9-]+
  return /^shell:[a-z0-9-]+$/.test(id);
}

export function validateEmail(email: string): boolean {
  // Basic email validation
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function sanitizeTerminalInput(data: string): string {
  // Remove control characters (0x00-0x08, 0x0b, 0x0c, 0x0e-0x1f, 0x7f)
  // eslint-disable-next-line no-control-regex
  return data.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

/**
 * Input Validation Middleware
 * Validates query params and inputs
 */
export async function validateInput(c: Context, next: Next): Promise<Response | void> {
  // Validate sandbox ID if provided
  const sandboxId = c.req.query("id");
  if (sandboxId && !validateSandboxId(sandboxId)) {
    return c.text("Invalid sandbox ID format", 400);
  }
  
  return await next();
}

/**
 * Session tracking store (in-memory for now, should use Durable Objects in production)
 * Maps sessionId to { email, lastActivity, sandboxId }
 */
const sessionStore = new Map<string, { email: string; lastActivity: number; sandboxId: string }>();

/**
 * Create or get session
 */
export function createSession(email: string, sandboxId: string): string {
  const sessionId = crypto.randomUUID();
  sessionStore.set(sessionId, {
    email,
    lastActivity: Date.now(),
    sandboxId,
  });
  return sessionId;
}

/**
 * Get session if valid (not expired)
 */
export function getSession(sessionId: string): { email: string; sandboxId: string } | null {
  const session = sessionStore.get(sessionId);
  if (!session) return null;
  
  // Check if expired
  if (Date.now() - session.lastActivity > IDLE_TIMEOUT) {
    sessionStore.delete(sessionId);
    return null;
  }
  
  return { email: session.email, sandboxId: session.sandboxId };
}

/**
 * Update session activity
 */
export function updateSessionActivity(sessionId: string): boolean {
  const session = sessionStore.get(sessionId);
  if (!session) return false;
  
  session.lastActivity = Date.now();
  return true;
}

/**
 * Session timeout check middleware
 */
export async function checkSessionTimeout(c: Context, next: Next): Promise<Response | void> {
  const sessionId = c.req.query("session");
  
  if (sessionId) {
    const session = getSession(sessionId);
    if (!session) {
      return c.text("Session timed out due to inactivity", 401);
    }
    // Update activity
    updateSessionActivity(sessionId);
  }
  
  return await next();
}
