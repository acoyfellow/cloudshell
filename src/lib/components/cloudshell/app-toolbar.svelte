<script lang="ts">
  import LogOut from '@lucide/svelte/icons/log-out';
  import Search from '@lucide/svelte/icons/search';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import { Button } from '$lib/components/ui/button';
  import { ButtonGroup, ButtonGroupText } from '$lib/components/ui/button-group';
  import { SidebarTrigger } from '$lib/components/ui/sidebar';
  import type { WorkspaceController } from '$lib/cloudshell/workspace-controller.svelte';

  let {
    controller,
    email,
    onToggleCommand,
    onSignOut,
  }: {
    controller: WorkspaceController;
    email: string;
    onToggleCommand: () => void;
    onSignOut: () => void;
  } = $props();

</script>

<header class="bg-background sticky top-0 z-30 border-b">
  <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
    <div class="flex min-w-0 items-center gap-3">
      <SidebarTrigger class="shrink-0" />

      <div class="flex min-w-0 items-center gap-2">
        <div class="flex min-w-0 flex-col">
          <span class="text-muted-foreground text-[0.7rem] font-semibold uppercase tracking-[0.22em]">
            Cloudshell
          </span>
          <span class="truncate text-sm font-medium">{email}</span>
        </div>

        <Button
          size="icon-sm"
          variant={controller.utilityPaneOpen ? 'default' : 'outline'}
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
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-end gap-2">
      <ButtonGroup>
        <Button
          size="lg"
          variant="outline"
          aria-label="Open command palette"
          title="Open command palette"
          onclick={onToggleCommand}
        >
          <Search />
        </Button>
        <ButtonGroupText class="hidden h-9 px-2.5 sm:flex">⌘K</ButtonGroupText>
      </ButtonGroup>

      <Button size="lg" variant="outline" onclick={onSignOut}>
        <LogOut />
        <span class="hidden md:inline">Logout</span>
      </Button>
    </div>
  </div>
</header>
