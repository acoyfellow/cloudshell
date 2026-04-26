import type { Env } from '../types';

type ChatMessage = { role: string; content: string };

type ChatRequest = {
  model?: string;
  messages?: ChatMessage[];
  max_tokens?: number;
  gatewayId?: string;
  collectLog?: boolean;
  metadata?: Record<string, string | number | boolean | null>;
};

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [{ role: 'user', content: 'reply exactly: gateway ok' }];
  }

  const messages = value
    .map((message) => {
      if (!message || typeof message !== 'object') return null;
      const role = typeof (message as { role?: unknown }).role === 'string'
        ? (message as { role: string }).role
        : 'user';
      const content = typeof (message as { content?: unknown }).content === 'string'
        ? (message as { content: string }).content
        : '';
      return content ? { role, content } : null;
    })
    .filter((message): message is ChatMessage => message != null);

  return messages.length ? messages : [{ role: 'user', content: 'reply exactly: gateway ok' }];
}

function extractText(result: unknown): string {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return JSON.stringify(result);

  const record = result as Record<string, unknown>;
  if (typeof record.response === 'string') return record.response;

  const nested = record.result;
  if (nested && typeof nested === 'object' && typeof (nested as Record<string, unknown>).response === 'string') {
    return (nested as Record<string, string>).response;
  }

  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown>;
    const message = first.message as Record<string, unknown> | undefined;
    if (message && typeof message.content === 'string') return message.content;
    if (typeof first.text === 'string') return first.text;
  }

  return JSON.stringify(result);
}

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

function normalizeGatewayId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(trimmed)) return null;
  return trimmed;
}

function normalizeMetadata(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const metadata: Record<string, string | number | boolean | null> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[a-zA-Z0-9_.:-]{1,64}$/.test(key)) continue;
    if (raw === null || typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      metadata[key] = raw;
    }
  }
  return metadata;
}

export async function handleAiGatewayUpstreamProof20260426(
  request: Request,
  env: Env
): Promise<Response> {
  const userId = request.headers.get('X-User-Id');
  if (!userId) {
    return new Response('not found', { status: 404 });
  }

  if (!env.AI) {
    return json({ error: 'AI binding missing' }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as ChatRequest;
  const model = typeof body.model === 'string' && body.model.trim()
    ? body.model.trim()
    : '@cf/meta/llama-3.1-8b-instruct';
  const messages = normalizeMessages(body.messages);
  const maxTokens = Math.min(Math.max(Math.trunc(Number(body.max_tokens ?? 64)), 1), 1024);
  const gatewayId = normalizeGatewayId(body.gatewayId);
  const metadata = {
    experiment: 'ai-gateway-upstream-proof-20260426',
    userId,
    ...normalizeMetadata(body.metadata),
  };
  const started = Date.now();

  try {
    const result = gatewayId
      ? await env.AI.gateway(gatewayId).run({
          provider: 'workers-ai',
          endpoint: model,
          headers: {
            'Content-Type': 'application/json',
          },
          query: {
            messages,
            max_tokens: maxTokens,
          },
        } as never, {
          gateway: {
            collectLog: body.collectLog !== false,
            metadata,
          },
        } as never)
      : await env.AI.run(model as never, {
          messages: messages as never,
          max_tokens: maxTokens,
        } as never);

    const raw = result instanceof Response ? await result.clone().json().catch(() => null) : result;
    const content = extractText(raw ?? result);

    return json({
      id: `chatcmpl_cloudshell_exp_${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      experiment: {
        name: 'ai-gateway-upstream-proof-20260426',
        upstream: gatewayId ? 'ai-gateway-workers-ai' : 'workers-ai-binding',
        gatewayId: gatewayId ? 'set' : null,
        durationMs: Date.now() - started,
        aiGatewayLogId: env.AI.aiGatewayLogId ?? null,
      },
      raw,
    });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      experiment: {
        name: 'ai-gateway-upstream-proof-20260426',
        upstream: gatewayId ? 'ai-gateway-workers-ai' : 'workers-ai-binding',
        gatewayId: gatewayId ? 'set' : null,
        durationMs: Date.now() - started,
        aiGatewayLogId: env.AI.aiGatewayLogId ?? null,
      },
    }, { status: 500 });
  }
}
