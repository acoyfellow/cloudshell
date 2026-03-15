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
  AUTH_USERNAME?: string;
  AUTH_PASSWORD?: string;
  JWT_SECRET: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_ACCOUNT_ID: string;
  Sandbox: DurableObjectNamespace<Container>;
  USERS_KV: KVNamespace;
  USER_DATA: R2Bucket;
}
