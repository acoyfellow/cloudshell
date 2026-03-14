import { describe, it, expect } from 'vitest';
import { getUserContainerId } from './auth';

describe('Per-User Isolation', () => {
  describe('getUserContainerId', () => {
    it('should generate unique container IDs for different users', () => {
      const id1 = getUserContainerId('alice');
      const id2 = getUserContainerId('bob');
      expect(id1).not.toBe(id2);
    });

    it('should normalize usernames to lowercase', () => {
      expect(getUserContainerId('Alice')).toBe('shell:alice');
      expect(getUserContainerId('ALICE')).toBe('shell:alice');
    });

    it('should replace non-alphanumeric characters with dashes', () => {
      expect(getUserContainerId('alice@example.com')).toBe('shell:alice-example-com');
      expect(getUserContainerId('user_name')).toBe('shell:user-name');
    });

    it('should produce consistent IDs for same username', () => {
      const id1 = getUserContainerId('testuser');
      const id2 = getUserContainerId('testuser');
      expect(id1).toBe(id2);
    });
  });

  describe('Container Isolation', () => {
    it('should prefix all container IDs with shell:', () => {
      expect(getUserContainerId('user')).toMatch(/^shell:/);
    });

    it('should handle empty username gracefully', () => {
      expect(getUserContainerId('')).toBe('shell:');
    });
  });
});