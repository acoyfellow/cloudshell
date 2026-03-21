<script lang="ts">
  import { browser } from '$app/environment';
  import type { Session, User } from 'better-auth';
  import { authStore } from '$lib/auth-store.svelte';

  let { user, session }: { user: User | null; session: Session | null } = $props();

  $effect(() => {
    if (browser) {
      authStore.initialize(user, session);
    }
  });
</script>
