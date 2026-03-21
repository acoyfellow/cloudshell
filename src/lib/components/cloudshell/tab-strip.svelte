<script lang="ts">
  import MoreHorizontal from '@lucide/svelte/icons/ellipsis';
  import PenSquare from '@lucide/svelte/icons/pen-square';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Tabs from '$lib/components/ui/tabs';
  import type { WorkspaceController } from '$lib/cloudshell/workspace-controller.svelte';
  import type { Tab } from '$lib/cloudshell/types';
  import LoadingPane from './loading-pane.svelte';

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

<div class:bg-background={!inline} class={`flex items-end gap-2 ${inline ? 'min-w-0 flex-1 overflow-visible' : 'border-b px-1 pt-2'}`}>
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
      <div class="flex min-h-11 items-center">
        <LoadingPane compact />
      </div>
    {:else}
      <Tabs.Root value={controller.activeTabId} class="min-w-0">
        <div class="tab-strip-scroll overflow-x-auto overflow-y-visible pb-0">
          <Tabs.List variant="line" class="min-w-max h-auto items-end gap-1 bg-transparent p-0">
            {#each controller.tabs as tab (tab.id)}
              <div
                class={`tab-shell group -mb-px min-w-0 max-w-64 ${
                  tab.id === controller.activeTabId
                    ? 'tab-shell--active z-10'
                    : 'tab-shell--inactive'
                }`}
              >
                <Tabs.Trigger
                  value={tab.id}
                  class={`hit-area-y-2 h-auto min-w-0 flex-1 justify-start rounded-t-md rounded-b-none border-0 px-4 py-2.5 text-left after:hidden data-active:bg-transparent ${
                    tab.id === controller.activeTabId
                      ? 'font-semibold text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onclick={() => controller.setActiveTab(tab.id)}
                >
                  <span class="truncate">{tab.name}</span>
                </Tabs.Trigger>

                <DropdownMenu.Root>
                  <DropdownMenu.Trigger
                    class={`hit-area-2 inline-flex size-9 shrink-0 items-center justify-center rounded-md transition-opacity ${
                      tab.id === controller.activeTabId
                        ? 'text-foreground/80 hover:bg-white/6 hover:text-foreground opacity-100'
                        : 'text-muted-foreground hover:bg-white/6 hover:text-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                    }`}
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
    border-left: 1px solid transparent;
    border-right: 1px solid transparent;
    border-top: 1px solid transparent;
    padding-right: 0.25rem;
    transition:
      background-color 140ms ease,
      border-color 140ms ease;
  }

  .tab-shell--active {
    background: rgba(255, 255, 255, 0.05);
    border-left-color: rgba(255, 255, 255, 0.08);
    border-right-color: rgba(255, 255, 255, 0.08);
    border-top-color: rgba(255, 255, 255, 0.08);
  }

  .tab-shell--inactive {
    background: rgba(255, 255, 255, 0.03);
    border-left-color: rgba(255, 255, 255, 0.035);
    border-right-color: rgba(255, 255, 255, 0.035);
    border-top-color: rgba(255, 255, 255, 0.035);
  }

  .tab-shell--inactive:hover {
    background: rgba(255, 255, 255, 0.04);
  }
</style>
