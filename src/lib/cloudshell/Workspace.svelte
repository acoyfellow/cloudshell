<script lang="ts">
  import WorkspaceShell from '$lib/components/cloudshell/workspace-shell.svelte';

  let { email }: { email: string } = $props();
</script>

<WorkspaceShell {email} />
