const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface TerminalTicketPayload {
  readonly userId: string;
  readonly userEmail: string | null;
  readonly sessionId: string;
  readonly tabId: string;
  readonly exp: number;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importSecret(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createTerminalTicket(
  payload: TerminalTicketPayload,
  secret: string
): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await importSecret(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));

  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyTerminalTicket(
  ticket: string,
  secret: string
): Promise<TerminalTicketPayload | null> {
  const [body, signature] = ticket.split('.');
  if (!body || !signature) {
    return null;
  }

  const key = await importSecret(secret);
  const verified = await crypto.subtle.verify(
    'HMAC',
    key,
    toArrayBuffer(fromBase64Url(signature)),
    encoder.encode(body)
  );

  if (!verified) {
    return null;
  }

  const payload = JSON.parse(decoder.decode(fromBase64Url(body))) as Partial<TerminalTicketPayload>;
  if (
    typeof payload.userId !== 'string' ||
    typeof payload.sessionId !== 'string' ||
    typeof payload.tabId !== 'string' ||
    typeof payload.exp !== 'number'
  ) {
    return null;
  }

  if (payload.exp <= Date.now()) {
    return null;
  }

  return {
    userId: payload.userId,
    userEmail: typeof payload.userEmail === 'string' ? payload.userEmail : null,
    sessionId: payload.sessionId,
    tabId: payload.tabId,
    exp: payload.exp,
  };
}
