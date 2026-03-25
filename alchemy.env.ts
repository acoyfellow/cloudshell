import { z } from 'zod';

/** Inputs Alchemy needs from the process environment (see `.env.example`). */
const raw = z
  .object({
    ALCHEMY_PASSWORD: z.string().min(1),
    TERMINAL_TICKET_SECRET: z.string().optional(),
    BETTER_AUTH_SECRET: z.string().optional(),
    R2_ACCOUNT_ID: z.string().optional(),
    CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
    BETTER_AUTH_URL: z.string().min(1).optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    CI: z.string().optional(),
    /** If set, deploys minimal Node `ws` parity container + guarded `/terminal` on the API worker. */
    TERMINAL_PARITY_SECRET: z.string().optional(),
  })
  .parse(process.env);

const terminalSecret = raw.TERMINAL_TICKET_SECRET ?? raw.BETTER_AUTH_SECRET;
if (!terminalSecret) {
  throw new Error('Set TERMINAL_TICKET_SECRET or BETTER_AUTH_SECRET');
}

const accountId = raw.R2_ACCOUNT_ID ?? raw.CLOUDFLARE_ACCOUNT_ID;
if (!accountId) {
  throw new Error('Set R2_ACCOUNT_ID or CLOUDFLARE_ACCOUNT_ID');
}

const betterAuthUrl =
  raw.BETTER_AUTH_URL ?? (raw.CI ? undefined : 'http://localhost:5173');
if (!betterAuthUrl) {
  throw new Error('BETTER_AUTH_URL is required in CI');
}

/** Resolved deploy-time settings for `alchemy.run.ts` and nothing else. */
export const deployEnv = {
  password: raw.ALCHEMY_PASSWORD,
  terminalSecret,
  accountId,
  betterAuthUrl,
  portForwardBaseDomain: new URL(betterAuthUrl).hostname,
  awsAccessKeyId: raw.AWS_ACCESS_KEY_ID ?? '',
  awsSecretAccessKey: raw.AWS_SECRET_ACCESS_KEY ?? '',
  terminalParitySecret: raw.TERMINAL_PARITY_SECRET?.trim() || undefined,
};
