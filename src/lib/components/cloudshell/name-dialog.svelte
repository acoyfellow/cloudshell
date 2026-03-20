<script lang="ts">
  import { toast } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Field from '$lib/components/ui/field';
  import { Input } from '$lib/components/ui/input';

  let {
    open = $bindable(false),
    title,
    description,
    placeholder = 'Name',
    submitLabel,
    initialName = '',
    onSubmit,
  }: {
    open?: boolean;
    title: string;
    description: string;
    placeholder?: string;
    submitLabel: string;
    initialName?: string;
    onSubmit: (name: string) => Promise<void>;
  } = $props();

  let name = $state('');
  let isSubmitting = $state(false);

  $effect(() => {
    if (open) {
      name = initialName;
    }
  });

  async function handleSubmit() {
    if (!name.trim() || isSubmitting) {
      return;
    }

    isSubmitting = true;
    try {
      await onSubmit(name.trim());
      open = false;
    } catch (error) {
      toast.error((error as Error).message || 'Unable to save');
    } finally {
      isSubmitting = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>{description}</Dialog.Description>
    </Dialog.Header>

    <Field.Field class="mt-2">
      <Field.Label for="entity-name">{placeholder}</Field.Label>
      <Field.Content>
        <Input
          id="entity-name"
          bind:value={name}
          placeholder={placeholder}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleSubmit();
            }
          }}
        />
      </Field.Content>
    </Field.Field>

    <Dialog.Footer class="mt-4">
      <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={isSubmitting || !name.trim()} onclick={handleSubmit}>
        {submitLabel}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
