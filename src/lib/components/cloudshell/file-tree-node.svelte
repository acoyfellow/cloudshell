<script lang="ts">
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Download from '@lucide/svelte/icons/download';
  import FileIcon from '@lucide/svelte/icons/file';
  import FolderIcon from '@lucide/svelte/icons/folder';
  import FileTreeNodeView from './file-tree-node.svelte';
  import type { WorkspaceController } from '$lib/cloudshell/workspace-controller.svelte';
  import type { FileTreeNode } from '$lib/cloudshell/types';

  let {
    node,
    controller,
    isExpanded,
    onToggleFolder,
    onOpenFile,
  }: {
    node: FileTreeNode;
    controller: WorkspaceController;
    isExpanded: (path: string) => boolean;
    onToggleFolder: (path: string) => void;
    onOpenFile: (path: string) => void;
  } = $props();

  const isActiveFolder = $derived(
    node.type === 'folder' && controller.currentFolderPath === node.path
  );
  const expanded = $derived(node.type === 'folder' ? isExpanded(node.path) : false);
</script>

{#if node.type === 'folder'}
  <div class="space-y-1">
    <button
      class={`hover:bg-muted/40 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        isActiveFolder ? 'bg-muted text-foreground' : 'text-muted-foreground'
      }`}
      onclick={() => onToggleFolder(node.path)}
      type="button"
    >
      <ChevronRight
        class={`size-4 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
      />
      <FolderIcon class="size-4 shrink-0" />
      <span class="truncate font-medium">{node.name}</span>
    </button>

    {#if expanded}
      <div class="border-border/40 ml-4 border-l pl-3">
        {#each node.children ?? [] as child (child.path)}
          <FileTreeNodeView
            node={child}
            {controller}
            {isExpanded}
            {onToggleFolder}
            {onOpenFile}
          />
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <button
    class="hover:bg-muted/35 text-muted-foreground flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:text-foreground"
    onclick={() => onOpenFile(node.path)}
    type="button"
  >
    <FileIcon class="size-4 shrink-0" />
    <span class="min-w-0 flex-1 truncate">{node.name}</span>
    <Download class="size-4 shrink-0 opacity-60" />
  </button>
{/if}
