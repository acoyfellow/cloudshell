<script lang="ts">
  import FileStack from '@lucide/svelte/icons/file-stack';
  import PanelRightOpen from '@lucide/svelte/icons/panel-right-open';
  import Wrench from '@lucide/svelte/icons/wrench';
  import X from '@lucide/svelte/icons/x';
  import Cable from '@lucide/svelte/icons/cable';
  import { Button } from '$lib/components/ui/button';
  import * as Sheet from '$lib/components/ui/sheet';
  import * as Tabs from '$lib/components/ui/tabs';
  import type { UtilityPaneTab, WorkspaceController } from '$lib/cloudshell/workspace-controller.svelte';
  import FilesPanel from './files-panel.svelte';
  import PortsPanel from './ports-panel.svelte';
  import ToolsPanel from './tools-panel.svelte';

  let {
    controller,
    mode,
  }: {
    controller: WorkspaceController;
    mode: 'desktop' | 'mobile';
  } = $props();

  const utilityTabs: Array<{ value: UtilityPaneTab; label: string; icon: typeof FileStack }> = [
    { value: 'files', label: 'Files', icon: FileStack },
    { value: 'ports', label: 'Ports', icon: Cable },
    { value: 'tools', label: 'Tools', icon: Wrench },
  ];
</script>

{#snippet UtilityContent()}
  <div class="bg-card flex h-full min-h-0 flex-col rounded-lg border shadow-none">
    <div class="flex items-start justify-between gap-3 px-4 py-4">
      <div class="flex min-w-0 items-center gap-3">
        <PanelRightOpen class="text-muted-foreground size-4 shrink-0" />
        <div class="min-w-0">
          <div class="font-medium">Utility workspace</div>
          <div class="text-muted-foreground text-xs">Files, ports, and workstation tools</div>
        </div>
      </div>

      {#if mode === 'desktop'}
        <Button size="icon-sm" variant="outline" onclick={() => controller.closeUtilityPane()}>
          <X class="size-4" />
          <span class="sr-only">Close panel</span>
        </Button>
      {/if}
    </div>

    <Tabs.Root value={controller.utilityPaneTab} class="min-h-0 flex-1">
      <div class="px-4">
        <Tabs.List variant="line" class="w-full justify-start gap-4 bg-transparent p-0">
          {#each utilityTabs as tab}
            <Tabs.Trigger
              value={tab.value}
              class="rounded-none border-0 bg-transparent px-0 py-2.5"
              onclick={() => controller.setUtilityPaneTab(tab.value)}
            >
              <tab.icon class="size-4" />
              <span>{tab.label}</span>
            </Tabs.Trigger>
          {/each}
        </Tabs.List>
      </div>

      <Tabs.Content value="files" class="min-h-0 flex-1 px-4 pt-5 pb-4">
        <FilesPanel {controller} />
      </Tabs.Content>
      <Tabs.Content value="ports" class="min-h-0 flex-1 px-4 pt-5 pb-4">
        <PortsPanel {controller} />
      </Tabs.Content>
      <Tabs.Content value="tools" class="min-h-0 flex-1 px-4 pt-5 pb-4">
        <ToolsPanel {controller} />
      </Tabs.Content>
    </Tabs.Root>
  </div>
{/snippet}

{#if mode === 'desktop'}
  {@render UtilityContent()}
{:else}
  <Sheet.Root bind:open={controller.utilityPaneOpen}>
    <Sheet.Content
      side="right"
      class="bg-background w-[min(92vw,28rem)] border-l p-0 [&>button]:hidden"
    >
      <Sheet.Header class="sr-only">
        <Sheet.Title>Utility workspace</Sheet.Title>
        <Sheet.Description>Files, ports, and workstation tools.</Sheet.Description>
      </Sheet.Header>
      <div class="h-full p-3">
        {@render UtilityContent()}
      </div>
    </Sheet.Content>
  </Sheet.Root>
{/if}
