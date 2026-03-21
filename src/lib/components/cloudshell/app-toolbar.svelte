<script lang="ts">
  import LogOut from '@lucide/svelte/icons/log-out';
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
    onSignOut,
  }: {
    controller: WorkspaceController;
    onCreateTab: () => void;
    onRenameTab: (tab: Tab) => void;
    onDeleteTab: (tab: Tab) => void;
    onToggleCommand: () => void;
    onSignOut: () => void;
  } = $props();
</script>

<header class="bg-background sticky top-0 z-30">
  <div class="flex min-h-16 items-end gap-3 border-b border-border/40 px-3 pt-2">
    <div class="flex min-w-0 flex-1 items-end gap-2 overflow-hidden">
      <SidebarTrigger class="thumb-icon-target hit-area-2 mb-px shrink-0 rounded-lg" />

      {#if controller.sessions.length > 0}
        <TabStrip
          {controller}
          inline
          {onCreateTab}
          {onRenameTab}
          {onDeleteTab}
        />
      {/if}
    </div>

    <div class="flex shrink-0 items-center justify-end gap-2 self-end pb-2">
      <Button
        size="icon"
        variant={controller.utilityPaneOpen ? 'default' : 'outline'}
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

      <Button
        size="icon"
        variant="outline"
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
        variant="outline"
        class="thumb-icon-target hit-area-2 rounded-xl"
        aria-label="Logout"
        title="Logout"
        onclick={onSignOut}
      >
        <LogOut />
        <span class="sr-only">Logout</span>
      </Button>
    </div>
  </div>
</header>
