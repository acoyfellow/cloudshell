import { betterAuth } from 'better-auth';
import { sveltekitCookies } from "better-auth/svelte-kit";
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import { user, session, account, verification } from './schema';
import { getRequestEvent } from '$app/server';

import type { D1Database } from '@cloudflare/workers-types';

type AuthInstance = ReturnType<typeof betterAuth>;

let authInstance: AuthInstance | null = null;
let drizzleInstance: ReturnType<typeof drizzle> | null = null;
let authBaseURL: string | null = null;
let authConfigKey: string | null = null;

export function getAuth(): AuthInstance {
  if (!authInstance) {
    throw new Error('Auth not initialized. Call initAuth() first.');
  }
  return authInstance;
}

export function getDrizzle(): ReturnType<typeof drizzle> {
  if (!drizzleInstance) {
    throw new Error('Database not initialized. Call initAuth() first.');
  }
  return drizzleInstance;
}

export function initAuth(db: D1Database, env?: any, baseURL?: string): AuthInstance {
  if (!db) {
    throw new Error('D1 database is required for Better Auth');
  }

  const resolvedBaseURL = baseURL || env?.BETTER_AUTH_URL || 'http://localhost:5173';
  const trustedOrigins = Array.from(
    new Set(
      [
        'http://localhost:5173',
        resolvedBaseURL,
        ...(env?.BETTER_AUTH_TRUSTED_ORIGINS
          ? String(env.BETTER_AUTH_TRUSTED_ORIGINS)
              .split(',')
              .map((origin: string) => origin.trim())
              .filter(Boolean)
          : []),
      ].filter(Boolean)
    )
  );
  const configKey = JSON.stringify({
    resolvedBaseURL,
    trustedOrigins,
  });

  if (authInstance && drizzleInstance && authConfigKey === configKey) {
    authBaseURL = authBaseURL || resolvedBaseURL;
    return authInstance;
  }

  if (!drizzleInstance) {
    drizzleInstance = drizzle(db, {
      schema: {
        user,
        session,
        account,
        verification,
      },
    });
  }

  authInstance = betterAuth({
    trustedOrigins,
    database: drizzleAdapter(drizzleInstance, {
      provider: 'sqlite',
      schema: {
        user,
        session,
        account,
        verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      requireEmailVerification: false,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    secret: env?.BETTER_AUTH_SECRET || (() => {
      throw new Error('BETTER_AUTH_SECRET environment variable is required');
    })(),
    baseURL: resolvedBaseURL,
    plugins: [sveltekitCookies(getRequestEvent as any)],
  }) as unknown as AuthInstance;

  authBaseURL = resolvedBaseURL;
  authConfigKey = configKey;

  return authInstance as AuthInstance;
}
