<script lang="ts">
  import "../app.css";
  import AuthLayoutSync from '$lib/auth-layout-sync.svelte';
  import { Toaster } from "$lib/components/ui/sonner";

  let { data, children } = $props();
</script>

<AuthLayoutSync user={data.user} session={data.session} />

<Toaster theme="dark" richColors />
{@render children()}
