import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, generateJWT, verifyJWT, extractBearerToken } from './auth';

describe('hashPassword', () => {
  it('should hash a password consistently', async () => {
    const password = 'test-password';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex string
  });

  it('should produce different hashes for different passwords', async () => {
    const hash1 = await hashPassword('password1');
    const hash2 = await hashPassword('password2');
    expect(hash1).not.toBe(hash2);
  });
});

describe('verifyPassword', () => {
  it('should return true for correct password', async () => {
    const password = 'test-password';
    const hash = await hashPassword(password);
    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  it('should return false for incorrect password', async () => {
    const password = 'test-password';
    const hash = await hashPassword(password);
    const isValid = await verifyPassword('wrong-password', hash);
    expect(isValid).toBe(false);
  });
});

describe('generateJWT and verifyJWT', () => {
  it('should generate and verify a valid JWT', async () => {
    const username = 'testuser';
    const { token, expires } = await generateJWT(username);

    expect(token).toBeDefined();
    expect(token.split('.')).toHaveLength(3); // header.payload.signature
    expect(expires).toBeGreaterThan(Date.now());

    const payload = await verifyJWT(token);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe(username);
    expect(payload?.exp).toBe(expires);
  });

  it('should reject an invalid token', async () => {
    const payload = await verifyJWT('invalid.token.here');
    expect(payload).toBeNull();
  });

  it('should reject a tampered token', async () => {
    const { token } = await generateJWT('testuser');
    const tampered = token.slice(0, -5) + 'XXXXX';
    const payload = await verifyJWT(tampered);
    expect(payload).toBeNull();
  });
});

describe('extractBearerToken', () => {
  it('should extract token from Bearer header', () => {
    const token = 'my-jwt-token';
    const authHeader = `Bearer ${token}`;
    expect(extractBearerToken(authHeader)).toBe(token);
  });

  it('should return null for invalid format', () => {
    expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBeNull();
    expect(extractBearerToken('Bearer')).toBeNull();
    expect(extractBearerToken(null as unknown as undefined)).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
  });
});
