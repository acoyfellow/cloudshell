<script lang="ts">
  import Search from '@lucide/svelte/icons/search';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import { Button } from '$lib/components/ui/button';
  import { SidebarTrigger } from '$lib/components/ui/sidebar';
  import type { WorkspaceController } from '$lib/cloudshell/workspace-controller.svelte';
  import type { Tab } from '$lib/cloudshell/types';
  import TabStrip from './tab-strip.svelte';

  let {
    controller,
    onCreateTab,
    onRenameTab,
    onDeleteTab,
    onToggleCommand,
  }: {
    controller: WorkspaceController;
    onCreateTab: () => void;
    onRenameTab: (tab: Tab) => void;
    onDeleteTab: (tab: Tab) => void;
    onToggleCommand: () => void;
  } = $props();
</script>

{#snippet SidebarToggle()}
  <SidebarTrigger class="thumb-icon-target hit-area-2 shrink-0 rounded-lg" />
{/snippet}

{#snippet ToolbarActions()}
  <Button
    size="icon"
    variant="ghost"
    class="thumb-icon-target hit-area-2 rounded-xl"
    aria-label="Open command palette"
    title="Open command palette"
    onclick={onToggleCommand}
  >
    <Search />
    <span class="sr-only">Open command palette</span>
  </Button>

  <Button
    size="icon"
    variant="ghost"
    class="thumb-icon-target hit-area-2 rounded-xl"
    aria-label={controller.utilityPaneOpen ? 'Close settings' : 'Open settings'}
    title={controller.utilityPaneOpen ? 'Close settings' : 'Open settings'}
    onclick={() =>
      controller.utilityPaneOpen
        ? controller.closeUtilityPane()
        : controller.openUtilityPane(controller.utilityPaneTab)
    }
  >
    <SlidersHorizontal />
  </Button>
{/snippet}

{#snippet InlineTabStrip()}
  <TabStrip
    {controller}
    inline
    {onCreateTab}
    {onRenameTab}
    {onDeleteTab}
  />
{/snippet}

<header class="bg-background sticky top-0 z-30 border-b border-border/40">
  <div class="md:hidden">
    <div class="flex min-h-16 items-center justify-between gap-3 border-b border-border/40 px-3">
      <div class="flex items-center gap-2">
        {@render SidebarToggle()}
      </div>

      <div class="flex shrink-0 items-center justify-end gap-2">
        {@render ToolbarActions()}
      </div>
    </div>

    {#if controller.sessions.length > 0}
      <div class="border-b border-border/40 px-3 pt-2">
        {@render InlineTabStrip()}
      </div>
    {/if}
  </div>

  <div class="hidden md:block">
    <div class="flex min-h-16 items-end gap-3 border-b border-border/40 px-3 pt-2">
      <div class="flex min-w-0 flex-1 items-end gap-2 overflow-visible">
        <div class="mb-px">
          {@render SidebarToggle()}
        </div>

        {#if controller.sessions.length > 0}
          {@render InlineTabStrip()}
        {/if}
      </div>

      <div class="flex shrink-0 items-center justify-end gap-2 self-end pb-2">
        {@render ToolbarActions()}
      </div>
    </div>
  </div>
</header>
