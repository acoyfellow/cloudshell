<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet';
  import type { WorkspaceController } from '$lib/cloudshell/workspace-controller.svelte';
  import FilesPanel from './files-panel.svelte';

  let { controller }: { controller: WorkspaceController } = $props();
</script>

<Sheet.Root bind:open={controller.filesDrawerOpen}>
  <Sheet.Content
    side="left"
    class="bg-background flex h-full w-[min(94vw,30rem)] flex-col border-r p-0 sm:w-[min(82vw,32rem)] [&>button]:top-4 [&>button]:right-4"
  >
    <Sheet.Header class="sr-only">
      <Sheet.Title>Files</Sheet.Title>
      <Sheet.Description>Browse and upload files from your shared workstation.</Sheet.Description>
    </Sheet.Header>

    <div class="min-h-0 flex-1">
      <FilesPanel {controller} />
    </div>
  </Sheet.Content>
</Sheet.Root>
