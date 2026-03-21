<script lang="ts">
  import MoreHorizontal from '@lucide/svelte/icons/ellipsis';
  import PenSquare from '@lucide/svelte/icons/pen-square';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import * as Tabs from '$lib/components/ui/tabs';
  import type { WorkspaceController } from '$lib/cloudshell/workspace-controller.svelte';
  import type { Tab } from '$lib/cloudshell/types';

  let {
    controller,
    inline = false,
    onCreateTab,
    onRenameTab,
    onDeleteTab,
  }: {
    controller: WorkspaceController;
    inline?: boolean;
    onCreateTab: () => void;
    onRenameTab: (tab: Tab) => void;
    onDeleteTab: (tab: Tab) => void;
  } = $props();
</script>

<div class:bg-background={!inline} class={`flex items-end gap-2 ${inline ? 'min-w-0 flex-1 overflow-hidden' : 'border-b px-1 pt-2'}`}>
  <div class="shrink-0 pb-px">
    <Button
      size="icon"
      variant="outline"
      class="thumb-icon-target hit-area-2 rounded-t-md rounded-b-none border-b-0"
      onclick={onCreateTab}
    >
      <Plus />
      <span class="sr-only">New tab</span>
    </Button>
  </div>

  <div class="min-w-0 flex-1">
    {#if controller.isWorkspaceLoading}
      <div class="flex gap-2">
        {#each Array.from({ length: 3 }) as _, index (index)}
          <Skeleton class="h-9 w-32 rounded-md" />
        {/each}
      </div>
    {:else}
      <Tabs.Root value={controller.activeTabId} class="min-w-0">
        <div class="tab-strip-scroll overflow-x-auto overflow-y-visible pb-0">
          <Tabs.List variant="line" class="min-w-max h-auto items-end gap-1 bg-transparent p-0">
            {#each controller.tabs as tab (tab.id)}
              <div
                class={`tab-shell group -mb-px min-w-0 max-w-64 ${
                  tab.id === controller.activeTabId
                    ? 'bg-background z-10'
                    : 'bg-muted/25 border-border/90 hover:bg-muted/35'
                }`}
              >
                <Tabs.Trigger
                  value={tab.id}
                  class="hit-area-y-2 h-auto min-w-0 flex-1 justify-start rounded-t-md rounded-b-none border-0 px-4 py-2.5 text-left after:hidden data-active:bg-transparent"
                  onclick={() => controller.setActiveTab(tab.id)}
                >
                  <span class="truncate">{tab.name}</span>
                </Tabs.Trigger>

                <DropdownMenu.Root>
                  <DropdownMenu.Trigger
                    class="text-muted-foreground hover:bg-muted hover:text-foreground hit-area-2 inline-flex size-9 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
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
        </div>
      </Tabs.Root>
    {/if}
  </div>
</div>

<style>
  .tab-strip-scroll {
    scrollbar-width: none;
  }

  .tab-strip-scroll::-webkit-scrollbar {
    display: none;
  }

  .tab-shell {
    position: relative;
    display: flex;
    align-items: center;
    overflow: hidden;
    border-top-left-radius: calc(var(--radius) - 2px);
    border-top-right-radius: calc(var(--radius) - 2px);
    border-left: 1px solid hsl(var(--border));
    border-right: 1px solid hsl(var(--border));
    border-top: 1px solid hsl(var(--border));
    padding-right: 0.25rem;
  }

  .tab-shell::before {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    height: 1px;
    background: hsl(var(--border));
    pointer-events: none;
  }
</style>
