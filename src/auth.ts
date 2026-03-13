/**
 * JWT Authentication utilities using Web Crypto API
 * No external JWT libraries needed on Cloudflare Workers
 */

export interface JWTPayload {
  sub: string; // username
  iat: number; // issued at
  exp: number; // expiration
}

export interface User {
  username: string;
  passwordHash: string;
  createdAt: number;
}

// JWT Secret from environment
const JWT_SECRET = 'cloudshell-jwt-secret-change-in-production';
const JWT_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Hash a password using SHA-256
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + JWT_SECRET);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const computedHash = await hashPassword(password);
  return computedHash === hash;
}

/**
 * Generate JWT token
 */
export async function generateJWT(username: string): Promise<{ token: string; expires: number }> {
  const now = Date.now();
  const exp = now + JWT_EXPIRY;

  const payload: JWTPayload = {
    sub: username,
    iat: now,
    exp: exp,
  };

  // Base64url encode header and payload
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));

  // Create signature
  const data = `${headerB64}.${payloadB64}`;
  const signature = await signData(data);
  const signatureB64 = base64UrlEncodeBuffer(signature);

  const token = `${headerB64}.${payloadB64}.${signatureB64}`;

  return { token, expires: exp };
}

/**
 * Verify JWT token
 */
export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    // Verify signature
    const data = `${headerB64}.${payloadB64}`;
    const signature = base64UrlDecode(signatureB64);
    const isValid = await verifySignature(data, signature);

    if (!isValid) return null;

    // Decode and verify payload
    const payload = JSON.parse(base64UrlDecodeString(payloadB64)) as JWTPayload;

    // Check expiration
    if (Date.now() > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Extract Bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;

  return parts[1];
}

/**
 * Base64url encoding
 */
function base64UrlEncode(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Base64url encode ArrayBuffer
 */
function base64UrlEncodeBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return base64UrlEncode(binary);
}

/**
 * Base64url decode to string
 */
function base64UrlDecodeString(str: string): string {
  // Add padding if needed
  const padding = '='.repeat((4 - (str.length % 4)) % 4);
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + padding;
  return atob(base64);
}

/**
 * Base64url decode to ArrayBuffer
 */
function base64UrlDecode(str: string): ArrayBuffer {
  const decoded = base64UrlDecodeString(str);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    bytes[i] = decoded.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Sign data using HMAC-SHA256
 */
async function signData(data: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(JWT_SECRET);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  return crypto.subtle.sign('HMAC', key, encoder.encode(data));
}

/**
 * Verify signature using HMAC-SHA256
 */
async function verifySignature(data: string, signature: ArrayBuffer): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(JWT_SECRET);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(data));
}
