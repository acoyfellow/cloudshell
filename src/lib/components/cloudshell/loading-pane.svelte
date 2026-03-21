<script lang="ts">
  import { Spinner } from '$lib/components/ui/spinner';

  let {
    title = '',
    description = '',
    overlay = false,
    compact = false,
  }: {
    title?: string;
    description?: string;
    overlay?: boolean;
    compact?: boolean;
  } = $props();
</script>

<div
  class={`flex h-full min-h-0 items-center justify-center ${
    overlay ? 'bg-background/80 absolute inset-0 z-10 backdrop-blur-[1px]' : ''
  }`}
  aria-live="polite"
>
  <div
    class={`bg-card flex flex-col items-center justify-center text-center shadow-none ${
      compact
        ? 'gap-2 rounded-md border px-4 py-4'
        : 'max-w-xs gap-3 rounded-md border px-5 py-5'
    }`}
  >
    <Spinner />
    {#if title}
      <div class="space-y-1">
        <div class="text-sm font-medium">{title}</div>
        {#if description}
          <p class="text-muted-foreground text-sm">{description}</p>
        {/if}
      </div>
    {/if}
  </div>
</div>
