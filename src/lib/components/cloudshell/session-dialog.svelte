<script lang="ts">
  import NameDialog from './name-dialog.svelte';

  let {
    open = $bindable(false),
    mode,
    initialName = '',
    onSubmit,
  }: {
    open?: boolean;
    mode: 'create' | 'rename';
    initialName?: string;
    onSubmit: (name: string) => Promise<void>;
  } = $props();
</script>

<NameDialog
  bind:open
  title={mode === 'create' ? 'Create session' : 'Rename session'}
  description={
    mode === 'create'
      ? 'Spin up a new isolated session and start with a fresh default tab.'
      : 'Update the session name shown in the left rail and command palette.'
  }
  placeholder="Session name"
  submitLabel={mode === 'create' ? 'Create session' : 'Save session'}
  {initialName}
  {onSubmit}
/>
