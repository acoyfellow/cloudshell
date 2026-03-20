<script lang="ts">
  import MoreHorizontal from '@lucide/svelte/icons/ellipsis';
  import PenSquare from '@lucide/svelte/icons/pen-square';
  import Plus from '@lucide/svelte/icons/plus';
  import SquareTerminal from '@lucide/svelte/icons/square-terminal';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import * as Tabs from '$lib/components/ui/tabs';
  import type { WorkspaceController } from '$lib/cloudshell/workspace-controller.svelte';
  import type { Tab } from '$lib/cloudshell/types';

  let {
    controller,
    onCreateTab,
    onRenameTab,
    onDeleteTab,
  }: {
    controller: WorkspaceController;
    onCreateTab: () => void;
    onRenameTab: (tab: Tab) => void;
    onDeleteTab: (tab: Tab) => void;
  } = $props();
</script>

<div class="bg-background flex items-center gap-3 border-b px-3 py-3 sm:px-4">
  <div class="min-w-0 flex-1">
    {#if controller.isWorkspaceLoading}
      <div class="flex gap-2">
        {#each Array.from({ length: 3 }) as _, index (index)}
          <Skeleton class="h-9 w-32 rounded-md" />
        {/each}
      </div>
    {:else}
      <Tabs.Root value={controller.activeTabId} class="min-w-0">
        <ScrollArea orientation="horizontal" class="w-full">
          <Tabs.List variant="line" class="min-w-max gap-2 bg-transparent p-0">
            {#each controller.tabs as tab (tab.id)}
              <div class="bg-background group relative flex min-w-0 max-w-56 items-center rounded-md border">
                <Tabs.Trigger
                  value={tab.id}
                  class="flex min-w-0 justify-start rounded-md px-3 py-2 text-left"
                  onclick={() => controller.setActiveTab(tab.id)}
                >
                  <SquareTerminal class="size-4" />
                  <span class="truncate">{tab.name}</span>
                </Tabs.Trigger>

                <DropdownMenu.Root>
                  <DropdownMenu.Trigger
                    class="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-1/2 right-1 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md opacity-0 transition-all group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    <MoreHorizontal class="size-4" />
                    <span class="sr-only">Tab actions</span>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="end" class="w-40">
                    <DropdownMenu.Item onclick={() => onRenameTab(tab)}>
                      <PenSquare class="size-4" />
                      <span>Rename</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item
                      class="text-destructive focus:text-destructive"
                      onclick={() => onDeleteTab(tab)}
                    >
                      <Trash2 class="size-4" />
                      <span>Close</span>
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </div>
            {/each}
          </Tabs.List>
        </ScrollArea>
      </Tabs.Root>
    {/if}
  </div>

  <Button size="lg" onclick={onCreateTab}>
    <Plus />
    <span>New tab</span>
  </Button>
</div>
