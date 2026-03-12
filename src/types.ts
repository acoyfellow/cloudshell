import type { Container } from "@cloudflare/containers";

/**
 * Cloudflare Workers environment bindings
 */
export interface Env {
  Sandbox: DurableObjectNamespace<Container>;
}
