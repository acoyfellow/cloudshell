<script lang="ts">
  import Cable from '@lucide/svelte/icons/cable';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Plus from '@lucide/svelte/icons/plus';
  import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '$lib/components/ui/empty';
  import { InputGroup, InputGroupButton, InputGroupInput } from '$lib/components/ui/input-group';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { toast } from 'svelte-sonner';
  import type { WorkspaceController } from '$lib/cloudshell/workspace-controller.svelte';

  let { controller }: { controller: WorkspaceController } = $props();

  let portInput = $state('');

  async function handleForwardPort() {
    try {
      await controller.forwardPort(portInput);
      portInput = '';
    } catch (error) {
      toast.error((error as Error).message || 'Unable to forward port');
    }
  }
</script>

<div class="flex h-full flex-col gap-4">
  <section class="space-y-3">
    <div class="space-y-1">
      <h3 class="text-base font-semibold">Expose a port</h3>
      <p class="text-muted-foreground text-sm">
        Attach a public edge URL to a process running inside the active session.
      </p>
    </div>
    <div>
      <InputGroup class="h-10">
        <InputGroupInput
          bind:value={portInput}
          placeholder="3000"
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleForwardPort();
            }
          }}
        />
        <InputGroupButton onclick={handleForwardPort}>
          <Plus class="size-4" />
          <span>Add</span>
        </InputGroupButton>
      </InputGroup>
    </div>
  </section>

  <section class="min-h-0 flex-1 space-y-3">
    <div class="space-y-1">
      <h3 class="text-base font-semibold">Forwarded ports</h3>
      <p class="text-muted-foreground text-sm">Each session keeps its own isolated port forwarding map.</p>
    </div>
    <div class="min-h-0 flex-1">
      {#if controller.isPortsLoading}
        <div class="space-y-3">
          {#each Array.from({ length: 4 }) as _, index (index)}
            <Skeleton class="h-18 rounded-lg" />
          {/each}
        </div>
      {:else if controller.ports.length === 0}
        <Empty class="bg-muted/20 rounded-lg border">
          <EmptyHeader>
            <EmptyMedia>
              <Cable class="text-muted-foreground size-5" />
            </EmptyMedia>
            <EmptyTitle>No forwarded ports</EmptyTitle>
            <EmptyDescription>
              Add a port above to route an app from this session to the edge.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      {:else}
        <ScrollArea class="h-full pr-3">
          <div class="space-y-3">
            {#each controller.ports as port (port.port)}
              <a
                class="bg-background hover:bg-muted/40 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors"
                href={port.url}
                rel="noreferrer"
                target="_blank"
              >
                <div class="space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="bg-muted text-foreground inline-flex min-w-12 items-center justify-center rounded-md border px-3 py-1 text-xs font-semibold">
                      {port.port}
                    </span>
                    <span class="text-sm font-medium">{port.url}</span>
                  </div>
                  <p class="text-muted-foreground text-xs">Open in a new tab</p>
                </div>
                <ExternalLink class="text-muted-foreground size-4" />
              </a>
            {/each}
          </div>
        </ScrollArea>
      {/if}
    </div>
  </section>
</div>
