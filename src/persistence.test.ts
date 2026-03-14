import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Per-user directory isolation', () => {
  describe('getUserContainerId', () => {
    it('should generate unique container IDs for different users', async () => {
      const { getUserContainerId } = await import('./auth');

      const id1 = getUserContainerId('alice');
      const id2 = getUserContainerId('bob');

      expect(id1).toBe('shell:alice');
      expect(id2).toBe('shell:bob');
      expect(id1).not.toBe(id2);
    });

    it('should normalize usernames to lowercase', async () => {
      const { getUserContainerId } = await import('./auth');

      expect(getUserContainerId('AlIce')).toBe('shell:alice');
      expect(getUserContainerId('BOB')).toBe('shell:bob');
    });

    it('should sanitize special characters in usernames', async () => {
      const { getUserContainerId } = await import('./auth');

      expect(getUserContainerId('user@example')).toBe('shell:user-example');
      expect(getUserContainerId('test_user')).toBe('shell:test-user');
      expect(getUserContainerId('user.name')).toBe('shell:user-name');
    });
  });
});
