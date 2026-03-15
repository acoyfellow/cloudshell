/**
 * JWT Authentication utilities using Web Crypto API
 * No external JWT libraries needed on Cloudflare Workers
 */

export interface JWTPayload {
  sub: string;
  iat: number;
  exp: number;
}

export interface User {
  username: string;
  passwordHash: string;
  createdAt: number;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiry: number;
}

const JWT_EXPIRY = 24 * 60 * 60 * 1000;

function getJwtSecret(env?: { JWT_SECRET?: string }): string {
  const secret = env?.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required. Set it via: wrangler secret put JWT_SECRET');
  }
  return secret;
}

export function getAuthConfig(env?: { JWT_SECRET?: string }): AuthConfig {
  return {
    jwtSecret: getJwtSecret(env),
    jwtExpiry: JWT_EXPIRY,
  };
}

export async function hashPassword(password: string, env?: { JWT_SECRET?: string }): Promise<string> {
  const config = getAuthConfig(env);
  const encoder = new TextEncoder();
  const data = encoder.encode(password + config.jwtSecret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password: string, hash: string, env?: { JWT_SECRET?: string }): Promise<boolean> {
  const computedHash = await hashPassword(password, env);
  return computedHash === hash;
}

export async function generateJWT(username: string, env?: { JWT_SECRET?: string }): Promise<{ token: string; expires: number }> {
  const config = getAuthConfig(env);
  const now = Date.now();
  const exp = now + config.jwtExpiry;

  const payload: JWTPayload = {
    sub: username,
    iat: now,
    exp: exp,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));

  const data = `${headerB64}.${payloadB64}`;
  const signature = await signData(data, config.jwtSecret);
  const signatureB64 = base64UrlEncodeBuffer(signature);

  const token = `${headerB64}.${payloadB64}.${signatureB64}`;

  return { token, expires: exp };
}

export async function verifyJWT(token: string, env?: { JWT_SECRET?: string }): Promise<JWTPayload | null> {
  try {
    const config = getAuthConfig(env);
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    const data = `${headerB64}.${payloadB64}`;
    const signature = base64UrlDecode(signatureB64);
    const isValid = await verifySignature(data, signature, config.jwtSecret);

    if (!isValid) return null;

    const payload = JSON.parse(base64UrlDecodeString(payloadB64)) as JWTPayload;

    if (Date.now() > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

export function getUserContainerId(username: string): string {
  return `shell:${username.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;

  return parts[1];
}

function base64UrlEncode(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlEncodeBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return base64UrlEncode(binary);
}

function base64UrlDecodeString(str: string): string {
  const padding = '='.repeat((4 - (str.length % 4)) % 4);
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + padding;
  return atob(base64);
}

function base64UrlDecode(str: string): ArrayBuffer {
  const decoded = base64UrlDecodeString(str);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    bytes[i] = decoded.charCodeAt(i);
  }
  return bytes.buffer;
}

async function signData(data: string, secret: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  return crypto.subtle.sign('HMAC', key, encoder.encode(data));
}

async function verifySignature(data: string, signature: ArrayBuffer, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(data));
}
