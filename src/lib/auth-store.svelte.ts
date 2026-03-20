import { signIn, signOut as signOutClient, signUp } from '$lib/auth-client';
import type { User, Session } from 'better-auth';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isInitialized: boolean;
}

class AuthStore {
  private state = $state<AuthState>({
    user: null,
    session: null,
    isLoading: false,
    isInitialized: false,
  });

  // Reactive getters
  get user() { return this.state.user; }
  get session() { return this.state.session; }
  get isLoading() { return this.state.isLoading; }
  get isInitialized() { return this.state.isInitialized; }
  get isAuthenticated() { return !!this.state.user; }

  // Initialize with server data (called from layout)
  initialize(serverUser: User | null, serverSession: Session | null) {
    this.state.user = serverUser;
    this.state.session = serverSession;
    this.state.isLoading = false;
    this.state.isInitialized = true;
  }

  // Auth actions that update the store
  async signIn(email: string, password: string) {
    this.state.isLoading = true;
    try {
      const result = await signIn.email({ email, password });

      if (result.error) {
        throw new Error(result.error.message);
      }
      this.state.user = result.data.user;
      this.state.isInitialized = true;
      this.state.isLoading = false;
      return result;
    } catch (error) {
      throw error;
    } finally {
      this.state.isLoading = false;
    }
  }

  async signUp(email: string, password: string, name?: string) {
    this.state.isLoading = true;
    try {
      const result = await signUp.email({
        email,
        password,
        name: name || email.split('@')[0]
      });

      if (result.error) {
        throw new Error(result.error.message);
      }
      this.state.user = result.data?.user ?? null;
      this.state.isInitialized = true;
      return result;
    } catch (error) {
      throw error;
    } finally {
      this.state.isLoading = false;
    }
  }

  async signOut() {
    this.state.isLoading = true;
    try {
      await signOutClient();
      this.state.user = null;
      this.state.session = null;
      this.state.isInitialized = true;
      this.state.isLoading = false;
    } catch (error) {
      throw error;
    } finally {
      this.state.isLoading = false;
    }
  }

  // Update session data (for when auth state changes)
  updateSession(user: User | null, session: Session | null) {
    this.state.user = user;
    this.state.session = session;
    this.state.isLoading = false;
    this.state.isInitialized = true;
  }
}

// Export singleton instance
export const authStore = new AuthStore();
