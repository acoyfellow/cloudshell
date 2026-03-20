<script lang="ts">
  import CircleDot from '@lucide/svelte/icons/circle-dot';
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

      <div class="flex min-w-0 flex-col">
        <span class="text-muted-foreground text-[0.7rem] font-semibold uppercase tracking-[0.22em]">
          Cloudshell
        </span>
        <span class="truncate text-sm font-medium">{email}</span>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-end gap-3">
      <Button
        size="lg"
        variant={controller.utilityPaneOpen ? 'default' : 'outline'}
        onclick={() =>
          controller.utilityPaneOpen
            ? controller.closeUtilityPane()
            : controller.openUtilityPane(controller.utilityPaneTab)
        }
      >
        <SlidersHorizontal />
        <span class="hidden lg:inline">Settings</span>
        <span class="sr-only lg:hidden">Settings</span>
      </Button>

      <ButtonGroup>
        <Button size="lg" variant="outline" onclick={onToggleCommand}>
          <Search />
          <span class="hidden md:inline">Command</span>
        </Button>
        <ButtonGroupText class="hidden h-9 md:flex">⌘K</ButtonGroupText>
      </ButtonGroup>

      <div
        class={
          controller.terminalStatus === 'connected'
            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 inline-flex size-8 items-center justify-center rounded-full border'
            : controller.terminalStatus === 'connecting'
              ? 'bg-amber-500/10 text-amber-200 border-amber-500/30 inline-flex size-8 items-center justify-center rounded-full border'
              : 'bg-muted text-muted-foreground inline-flex size-8 items-center justify-center rounded-full border'
        }
        aria-label={`Terminal ${controller.terminalStatus}`}
        title={`Terminal ${controller.terminalStatus}`}
      >
        <CircleDot class="size-3.5" />
        <span class="sr-only">Terminal {controller.terminalStatus}</span>
      </div>

      <Button size="lg" variant="outline" onclick={onSignOut}>
        <LogOut />
        <span class="hidden md:inline">Logout</span>
      </Button>
    </div>
  </div>
</header>
