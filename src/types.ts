import type { Sandbox } from "@cloudflare/sandbox";

/**
 * Cloudflare Workers environment bindings
 */
export interface Env {
  Sandbox: DurableObjectNamespace<Sandbox>;
}

/**
 * Session timeout - 30 minutes of inactivity
 */
export const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds

/**
 * Session state stored in Durable Object
 * 
 * Session Lifecycle:
 *   create → active → idle → timeout → destroy
 * 
 * - On connect: Session is created or resumed
 * - On activity: lastActivity timestamp updated
 * - On disconnect: Session stays alive (container warm)
 * - After IDLE_TIMEOUT: Session is destroyed
 */
export interface SessionState {
  /** Unique session ID (crypto.randomUUID) */
  id: string;
  /** User email from CF Access */
  email: string;
  /** Derived sandbox ID */
  sandboxId: string;
  /** Session creation timestamp */
  createdAt: number;
  /** Last activity timestamp (updated on each interaction) */
  lastActivity: number;
  /** Timeout duration in ms (default: IDLE_TIMEOUT) */
  timeoutMs: number;
}

/**
 * Session manager interface for CRUD operations
 */
export interface SessionManager {
  /**
   * Create a new session for a user
   * @param email - User email from CF Access
   * @param sandboxId - Derived sandbox ID
   * @returns The created session state
   */
  create(email: string, sandboxId: string): Promise<SessionState>;

  /**
   * Get a session by ID
   * @param sessionId - Session ID from query param
   * @returns Session state or null if not found
   */
  get(sessionId: string): Promise<SessionState | null>;

  /**
   * Update lastActivity timestamp
   * @param sessionId - Session ID
   */
  updateActivity(sessionId: string): Promise<void>;

  /**
   * Destroy a session
   * @param sessionId - Session ID
   */
  destroy(sessionId: string): Promise<void>;

  /**
   * Check if session is valid (not timed out and belongs to user)
   * @param session - Session state
   * @param email - User email to validate against
   * @returns true if session is valid
   */
  isValid(session: SessionState, email: string): boolean;
}

/**
 * Session validation result
 */
export interface ValidationResult {
  valid: boolean;
  reason?: 'not_found' | 'expired' | 'email_mismatch';
}
