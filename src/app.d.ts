import type { User, Session } from 'better-auth';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: User | null;
			session: Session | null;
		}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env?: {
				DB: D1Database;
				WORKER: Fetcher;
				BETTER_AUTH_SECRET?: string;
				BETTER_AUTH_URL?: string;
				BETTER_AUTH_TRUSTED_ORIGINS?: string;
				TERMINAL_TICKET_SECRET?: string;
				WORKER_DEV_ORIGIN?: string;
				/** Base URL for WSS terminal (worker custom domain), e.g. https://api.example.com */
				WORKER_PUBLIC_ORIGIN?: string;
			};
		}
	}
}

export {};
