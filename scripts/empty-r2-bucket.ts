/**
 * Deletes every object in an R2 bucket via Cloudflare REST API (uses CLOUDFLARE_API_TOKEN).
 * Usage: bun scripts/empty-r2-bucket.ts [bucket-name]
 */
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const bucket = process.argv[2] ?? 'cloudshell-user-data';

if (!accountId || !token) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN');
  process.exit(1);
}

const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects`;

async function deleteKey(key: string): Promise<void> {
  const delUrl = `${base}/${encodeURIComponent(key)}`;
  const delRes = await fetch(delUrl, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const delJson = (await delRes.json()) as {
    success: boolean;
    errors?: { code?: number; message?: string }[];
  };
  if (delJson.success) return;
  const code = delJson.errors?.[0]?.code;
  // Already removed (parallel deletes or listing overlap)
  if (code === 10007) return;
  throw new Error(`Delete failed for ${key}: ${JSON.stringify(delJson)}`);
}

const CONCURRENCY = 32;
let cursor = '';
let deleted = 0;

for (;;) {
  const url = new URL(base);
  url.searchParams.set('per_page', '1000');
  if (cursor) url.searchParams.set('cursor', cursor);

  const listRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = (await listRes.json()) as {
    success: boolean;
    errors?: unknown;
    result?: { key: string }[];
    result_info?: { cursor?: string; is_truncated?: boolean };
  };

  if (!data.success) {
    console.error(data);
    process.exit(1);
  }

  const objects = data.result ?? [];

  for (let i = 0; i < objects.length; i += CONCURRENCY) {
    const chunk = objects.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map((o) => deleteKey(o.key)));
    deleted += chunk.length;
    if (deleted % 500 === 0) {
      console.error(`… ${deleted} deleted`);
    }
  }

  const info = data.result_info;
  if (!info?.is_truncated) break;
  cursor = info.cursor ?? '';
  if (!cursor) break;
}

console.log(`Deleted ${deleted} object(s) from ${bucket}.`);
