<script lang="ts">
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Upload from '@lucide/svelte/icons/upload';
  import { Button } from '$lib/components/ui/button';
  import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '$lib/components/ui/empty';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Spinner } from '$lib/components/ui/spinner';
  import type { WorkspaceController } from '$lib/cloudshell/workspace-controller.svelte';
  import type { FileTreeNode } from '$lib/cloudshell/types';
  import FileTreeNodeView from './file-tree-node.svelte';
  import LoadingPane from './loading-pane.svelte';

  let { controller }: { controller: WorkspaceController } = $props();

  const fileBreadcrumbs = $derived(controller.fileBreadcrumbs ?? []);
  let expandedFolders = $state<string[]>([]);
  let fileInput: HTMLInputElement | null = null;
  let dragDepth = $state(0);
  let isDraggingFiles = $state(false);

  function syncFiles() {
    if (
      controller.isFilesLoading ||
      controller.isFilesRefreshing ||
      controller.isFilesUploading ||
      (typeof document !== 'undefined' && document.hidden)
    ) {
      return;
    }

    void controller.refreshFiles({ background: true });
  }

  function expandAncestors(path: string) {
    const segments = path.split('/').filter(Boolean);
    let current = '';
    const next = new Set(expandedFolders);

    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      next.add(current);
    }

    expandedFolders = Array.from(next);
  }

  function isExpanded(path: string): boolean {
    return expandedFolders.includes(path);
  }

  function toggleFolder(path: string) {
    controller.setCurrentFolder(path);

    if (isExpanded(path)) {
      expandedFolders = expandedFolders.filter((candidate) => candidate !== path);
      return;
    }

    expandAncestors(path);
  }

  function openFile(path: string) {
    controller.downloadFile(path);
  }

  function openFilePicker() {
    if (controller.isFilesUploading) {
      return;
    }

    fileInput?.click();
  }

  async function handleFileSelection(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    await controller.uploadFiles(input.files, controller.currentFolderPath);
    input.value = '';
  }

  function hasFilePayload(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes('Files') ?? false;
  }

  function handleDragEnter(event: DragEvent) {
    if (!hasFilePayload(event)) {
      return;
    }

    event.preventDefault();
    dragDepth += 1;
    isDraggingFiles = true;
  }

  function handleDragOver(event: DragEvent) {
    if (!hasFilePayload(event)) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  function handleDragLeave(event: DragEvent) {
    if (!hasFilePayload(event)) {
      return;
    }

    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      isDraggingFiles = false;
    }
  }

  async function handleDrop(event: DragEvent) {
    if (!hasFilePayload(event)) {
      return;
    }

    event.preventDefault();
    dragDepth = 0;
    isDraggingFiles = false;
    await controller.uploadFiles(event.dataTransfer?.files ?? null, controller.currentFolderPath);
  }

  $effect(() => {
    if (controller.currentFolderPath) {
      expandAncestors(controller.currentFolderPath);
    }
  });

  $effect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleFocus = () => {
      syncFiles();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        syncFiles();
      }
    };

    const syncInterval = window.setInterval(syncFiles, 2500);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(syncInterval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  });
</script>

<div
  class="relative flex h-full min-h-0 flex-col"
  role="region"
  aria-label="Files drawer"
  ondragenter={handleDragEnter}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <div class="border-border/40 flex items-center justify-between gap-3 border-b px-4 py-3 pr-24">
    <div class="flex min-w-0 flex-wrap items-center gap-1 text-sm">
      {#each fileBreadcrumbs as breadcrumb, index (breadcrumb.path)}
        <button
          class={`hover:text-foreground rounded px-1 py-0.5 transition-colors ${
            breadcrumb.path === controller.currentFolderPath
              ? 'text-foreground'
              : 'text-muted-foreground'
          }`}
          onclick={() => controller.setCurrentFolder(breadcrumb.path)}
          type="button"
        >
          {breadcrumb.label}
        </button>
        {#if index < fileBreadcrumbs.length - 1}
          <ChevronRight class="text-muted-foreground size-3.5" />
        {/if}
      {/each}
    </div>

    <input
      bind:this={fileInput}
      hidden
      multiple
      type="file"
      onchange={handleFileSelection}
    />

    <div class="flex shrink-0 items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        class="shrink-0"
        onclick={openFilePicker}
        disabled={controller.isFilesUploading}
      >
        {#if controller.isFilesUploading}
          <Spinner class="size-4" />
        {:else}
          <Upload class="size-4" />
        {/if}
        <span>{controller.isFilesUploading ? 'Uploading…' : 'Upload'}</span>
      </Button>
    </div>
  </div>

  {#if isDraggingFiles}
    <div class="bg-background/80 border-primary/40 pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-xl border border-dashed backdrop-blur-sm">
      <div class="bg-card text-card-foreground flex items-center gap-3 rounded-xl border px-4 py-3 shadow-sm">
        <Upload class="size-4" />
        <div class="text-sm font-medium">Drop files to upload here</div>
      </div>
    </div>
  {/if}

  <div class="min-h-0 flex-1">
    {#if controller.isFilesLoading}
      <div class="h-full p-4">
        <LoadingPane compact />
      </div>
    {:else if controller.fileTree.length === 0}
      <Empty class="h-full border-0 bg-transparent">
        <EmptyHeader>
          <EmptyMedia>
            <Upload class="text-muted-foreground size-5" />
          </EmptyMedia>
          <EmptyTitle>No files yet</EmptyTitle>
          <EmptyDescription>
            Upload a file to start building out your workstation folders.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    {:else}
      <ScrollArea class="h-full">
        <div class="space-y-1 p-3">
          {#each controller.fileTree as node (node.path)}
            <FileTreeNodeView
              {node}
              {controller}
              isExpanded={isExpanded}
              onToggleFolder={toggleFolder}
              onOpenFile={openFile}
            />
          {/each}
        </div>
      </ScrollArea>
    {/if}
  </div>
</div>
