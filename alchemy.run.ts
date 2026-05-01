import alchemy from 'alchemy';
import {
  Container,
  CustomDomain,
  D1Database,
  DurableObjectNamespace,
  KVNamespace,
  R2Bucket,
  Ai,
  SvelteKit,
  Worker,
} from 'alchemy/cloudflare';
import { deployEnv } from './alchemy.env';

const projectName = 'cloudshell';
const workerName = `${projectName}-worker`;

/** Browser WSS terminal URL (must match worker HTTPS custom domain). */
const WORKER_PUBLIC_ORIGIN = 'https://cloudshell-api.coey.dev';

const isLocalDevHostname =
  deployEnv.portForwardBaseDomain === 'localhost' ||
  deployEnv.portForwardBaseDomain === '127.0.0.1';

const project = await alchemy(projectName, {
  password: deployEnv.password,
});

const DB = await D1Database(`${projectName}-db`, {
  name: `${projectName}-db`,
  migrationsDir: 'migrations',
  adopt: true,
});

const USERS_KV = await KVNamespace(`${projectName}-users`, {
  title: `${projectName}-users`,
  adopt: true,
});

const USER_DATA = await R2Bucket(`${projectName}-user-data`, {
  name: `${projectName}-user-data`,
  adopt: true,
});

const AI = Ai();

const Sandbox = await Container('sandbox', {
  className: 'CloudShellTerminal',
  scriptName: workerName,
  maxInstances: 5,
  adopt: true,
  build: {
    context: '.',
    dockerfile: 'worker/Dockerfile',
  },
});

/**
 * Per-user Agent DO holding MCP OAuth connections + tokens.
 * See worker/user-agent.ts for the CloudshellUserAgent class and the A.1
 * step of the MCP auth broker plan.
 *
 * `sqlite: true` gives the Agent SDK the SQLite-backed storage it needs
 * (agents@0.11.x uses DurableObjectOAuthClientProvider which writes to
 * ctx.storage; SQLite is the current-generation backend).
 */
const UserAgent = await DurableObjectNamespace(`${projectName}-user-agent`, {
  className: 'CloudshellUserAgent',
  scriptName: workerName,
  sqlite: true,
});

/** Optional: cloudflare/containers-demos `terminal/` shaped Node `ws` host for `/terminal` smoke on the API worker. */
const TerminalParity =
  deployEnv.terminalParitySecret != null && deployEnv.terminalParitySecret.length > 0
    ? await Container('terminal-parity', {
        className: 'CloudShellParityTerminal',
        scriptName: workerName,
        maxInstances: 1,
        adopt: true,
        build: {
          context: '.',
          dockerfile: 'worker/parity-container/Dockerfile',
        },
      })
    : undefined;

export const WORKER = await Worker(workerName, {
  name: workerName,
  entrypoint: './worker/index.ts',
  compatibility: 'node',
  compatibilityDate: '2026-04-07',
  adopt: true,
  observability: { enabled: true },
  bindings: {
    Sandbox,
    UserAgent,
    USERS_KV,
    USER_DATA,
    AI,
    TERMINAL_TICKET_SECRET: deployEnv.terminalSecret,
    AWS_ACCESS_KEY_ID: deployEnv.awsAccessKeyId,
    AWS_SECRET_ACCESS_KEY: deployEnv.awsSecretAccessKey,
    R2_BUCKET_NAME: USER_DATA.name,
    R2_ACCOUNT_ID: deployEnv.accountId,
    PORT_FORWARD_BASE_DOMAIN: deployEnv.portForwardBaseDomain,
    ...(TerminalParity != null
      ? {
          TerminalParity,
          TERMINAL_PARITY_SECRET: deployEnv.terminalParitySecret!,
        }
      : {}),
  },
  url: false,
  ...(isLocalDevHostname
    ? {}
    : {
        domains: [new URL(WORKER_PUBLIC_ORIGIN).hostname],
      }),
});

export const APP = await SvelteKit(`${projectName}-app`, {
  name: `${projectName}-app`,
  dev: {
    command: 'bun vite dev --host 0.0.0.0',
    domain: 'localhost:5173',
  },
  compatibility: 'node',
  compatibilityDate: '2026-04-07',
  bindings: {
    DB,
    WORKER,
  },
  url: true,
  adopt: true,
  env: {
    BETTER_AUTH_SECRET: deployEnv.terminalSecret,
    BETTER_AUTH_URL: deployEnv.betterAuthUrl,
    BETTER_AUTH_TRUSTED_ORIGINS: ['http://localhost:5173', deployEnv.betterAuthUrl].join(','),
    TERMINAL_TICKET_SECRET: deployEnv.terminalSecret,
    WORKER_DEV_ORIGIN: WORKER.url || 'http://localhost:1338',
    WORKER_PUBLIC_ORIGIN,
    /**
     * Comma-separated allow-list of emails permitted to sign up.
     * Empty string means signup is denied for everyone. See
     * `src/lib/auth.ts` databaseHooks.user.create.before.
     */
    ALLOWED_EMAILS: deployEnv.allowedEmails,
  },
});

export const APP_DOMAIN = isLocalDevHostname
  ? undefined
  : await CustomDomain(`${projectName}-app-domain`, {
      name: deployEnv.portForwardBaseDomain,
      workerName: APP.name,
      adopt: true,
    });

await project.finalize();
