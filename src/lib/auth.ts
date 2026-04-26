import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { sveltekitCookies } from "better-auth/svelte-kit";
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import { user, session, account, verification } from './schema';
import { getRequestEvent } from '$app/server';

import type { D1Database } from '@cloudflare/workers-types';

/**
 * Parse `ALLOWED_EMAILS` (comma-separated) into a normalized lower-case Set.
 * Empty/unset means signup is denied for everyone (existing accounts can
 * still log in). Exported for tests.
 */
export function parseAllowedEmails(raw: string | undefined | null): Set<string> {
  if (!raw) return new Set();
  return new Set(
    String(raw)
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * True if the email is in the allow-list. Case-insensitive.
 * Empty allow-list always returns false (deny by default).
 */
export function isAllowedEmail(email: string, allowed: Set<string>): boolean {
  if (!email || allowed.size === 0) return false;
  return allowed.has(email.trim().toLowerCase());
}

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
    allowedEmails: env?.ALLOWED_EMAILS ?? '',
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
    /**
     * Application-level signup gate. Better Auth will run this hook before
     * inserting a new `user` row, regardless of which signup endpoint is
     * called. Throwing `APIError` rejects the signup with that status.
     *
     * Source of truth for the allow-list is the `ALLOWED_EMAILS` env var
     * (comma-separated), wired through `alchemy.run.ts`. An empty/unset
     * value denies all signups; existing users can still sign in.
     *
     * Caveat: this only blocks new account creation. It does not affect
     * sign-in for accounts that already exist.
     */
    databaseHooks: {
      user: {
        create: {
          before: async (newUser: { email: string }) => {
            const allowed = parseAllowedEmails(env?.ALLOWED_EMAILS);
            if (!isAllowedEmail(newUser.email, allowed)) {
              throw new APIError('FORBIDDEN', {
                message: 'Signup is restricted. Contact the admin to be added to the allow-list.',
              });
            }
            return { data: newUser };
          },
        },
      },
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
