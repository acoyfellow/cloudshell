<script lang="ts" module>
  export type DestructiveConfirmProps = {
    open?: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => Promise<void>;
    onOpenChange?: (open: boolean) => void;
  };
</script>

<script lang="ts">
  import { toast } from 'svelte-sonner';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';

  let {
    open = $bindable(false),
    title,
    description,
    confirmLabel = 'Delete',
    onConfirm,
    onOpenChange,
  }: DestructiveConfirmProps = $props();

  let isSubmitting = $state(false);

  async function handleConfirm() {
    if (isSubmitting) {
      return;
    }

    isSubmitting = true;
    try {
      await onConfirm();
      open = false;
    } catch (error) {
      toast.error((error as Error).message || 'Unable to complete action');
    } finally {
      isSubmitting = false;
    }
  }
</script>

<AlertDialog.Root bind:open {onOpenChange}>
  <AlertDialog.Content class="sm:max-w-md">
    <AlertDialog.Header>
      <AlertDialog.Title>{title}</AlertDialog.Title>
      <AlertDialog.Description>{description}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={isSubmitting}>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action class="bg-destructive text-destructive-foreground" onclick={handleConfirm}>
        {confirmLabel}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
