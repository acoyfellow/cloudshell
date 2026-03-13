import type { Container } from "@cloudflare/containers";

/**
 * Cloudflare Workers environment bindings
 */
export interface Env {
  AUTH_USERNAME?: string;
  AUTH_PASSWORD?: string;
  Sandbox: DurableObjectNamespace<Container>;
}
