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
  title={mode === 'create' ? 'Create tab' : 'Rename tab'}
  description={
    mode === 'create'
      ? 'Tabs are independent terminal states inside the active session.'
      : 'Update the tab name shown in the top strip and command palette.'
  }
  placeholder="Tab name"
  submitLabel={mode === 'create' ? 'Create tab' : 'Save tab'}
  {initialName}
  {onSubmit}
/>
