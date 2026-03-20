<script lang="ts">
  import { browser } from '$app/environment';
  import "../app.css";
  import { authStore } from "$lib/auth-store.svelte";
  import { Toaster } from "$lib/components/ui/sonner";

  let { data, children } = $props();

  $effect(() => {
    if (browser) {
      authStore.initialize(data.user, data.session);
    }
  });
</script>

<Toaster theme="dark" richColors />
{@render children()}
