/* eslint-disable no-undef */
import type { Container } from '@cloudflare/containers';

declare global {
  interface KVNamespace {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: {
      prefix?: string;
      limit?: number;
      cursor?: string;
    }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
  }
}

export interface Env {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_ACCOUNT_ID: string;
  /** Hostname for `https://<port>-<id>.<domain>`; set from BETTER_AUTH_URL in alchemy.run.ts */
  PORT_FORWARD_BASE_DOMAIN: string;
  TERMINAL_TICKET_SECRET: string;
  /** Present only when `TERMINAL_PARITY_SECRET` is set at deploy (smoke / Cloudflare-demo-shaped path). */
  TERMINAL_PARITY_SECRET?: string;
  Sandbox: DurableObjectNamespace<Container>;
  /** Optional: minimal Node `ws` container (containers-demos/terminal style). */
  TerminalParity?: DurableObjectNamespace<Container>;
  /**
   * Per-user Agent DO holding that user's MCP OAuth connections + tokens.
   * Namespace is keyed by Better Auth user ID (see worker/user-agent.ts).
   * Added for cloudshell's MCP auth broker (see A.1 of the broker plan).
   */
  UserAgent: DurableObjectNamespace;
  USERS_KV: KVNamespace;
  USER_DATA: R2Bucket;
}

export interface Tab {
  id: string;
  name: string;
  createdAt: number;
}

export interface Session {
  id: string;
  name: string;
  createdAt: number;
  lastActiveTabId: string;
  lastOpenedAt: number;
}

export interface SessionPort {
  port: number;
  url: string;
  createdAt: number;
}

export interface FileRecord {
  name: string;
  path: string;
  size: number;
  modifiedAt: number;
}

export interface ShareToken {
  token: string;
  permissions: 'read' | 'write';
  expiresAt: number;
  createdBy: string;
  sessionId: string;
}
