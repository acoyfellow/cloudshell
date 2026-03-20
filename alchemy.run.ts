import alchemy from 'alchemy';
import {
  Container,
  D1Database,
  KVNamespace,
  R2Bucket,
  SvelteKit,
  Worker,
} from 'alchemy/cloudflare';

const projectName = 'cloudshell';
const workerName = `${projectName}-worker`;
const terminalTicketSecret =
  process.env.TERMINAL_TICKET_SECRET ||
  process.env.BETTER_AUTH_SECRET ||
  '85ffaf768460252698ede4b8af94774c283d815139c4d6fcebca624c61a2e01f';
const accountId =
  process.env.R2_ACCOUNT_ID ||
  process.env.CLOUDFLARE_ACCOUNT_ID ||
  'bfcb6ac5b3ceaf42a09607f6f7925823';

const project = await alchemy(projectName, {
  password: process.env.ALCHEMY_PASSWORD || 'default-password',
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

export const WORKER = await Worker(workerName, {
  name: workerName,
  entrypoint: './worker/index.ts',
  compatibility: 'node',
  adopt: true,
  observability: { enabled: true },
  bindings: {
    Sandbox,
    USERS_KV,
    USER_DATA,
    TERMINAL_TICKET_SECRET: terminalTicketSecret,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
    R2_BUCKET_NAME: USER_DATA.name,
    R2_ACCOUNT_ID: accountId,
  },
  url: false,
});

export const APP = await SvelteKit(`${projectName}-app`, {
  name: `${projectName}-app`,
  compatibility: 'node',
  bindings: {
    DB,
    WORKER,
  },
  url: true,
  adopt: true,
  env: {
    BETTER_AUTH_SECRET: terminalTicketSecret,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || 'http://localhost:5173',
    TERMINAL_TICKET_SECRET: terminalTicketSecret,
    WORKER_DEV_ORIGIN: WORKER.url || 'http://localhost:1337',
  },
});

await project.finalize();
