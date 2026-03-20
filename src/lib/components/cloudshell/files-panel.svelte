<script lang="ts">
  import Download from '@lucide/svelte/icons/download';
  import FilesIcon from '@lucide/svelte/icons/files';
  import Upload from '@lucide/svelte/icons/upload';
  import { Button } from '$lib/components/ui/button';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '$lib/components/ui/card';
  import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '$lib/components/ui/empty';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { Spinner } from '$lib/components/ui/spinner';
  import type { WorkspaceController } from '$lib/cloudshell/workspace-controller.svelte';

  let { controller }: { controller: WorkspaceController } = $props();

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  function formatSize(size: number): string {
    if (size < 1024) {
      return `${size} B`;
    }

    if (size < 1024 * 1024) {
      return `${Math.round(size / 1024)} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<div class="flex h-full flex-col gap-4">
  <Card class="bg-card shadow-none">
    <CardHeader>
      <CardTitle>Workspace files</CardTitle>
      <CardDescription>
        Upload artifacts to your shared user box and pull them back down from any session.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <label class="bg-muted/30 hover:bg-muted/50 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-5 py-8 text-center transition-colors">
        <div class="bg-muted text-foreground flex size-10 items-center justify-center rounded-md border">
          {#if controller.isFilesUploading}
            <Spinner class="size-4" />
          {:else}
            <Upload class="size-4" />
          {/if}
        </div>
        <div class="space-y-1">
          <p class="text-sm font-medium">
            {controller.isFilesUploading ? 'Uploading files…' : 'Drop files here or click to upload'}
          </p>
          <p class="text-muted-foreground text-xs">
            Files are stored in your shared workstation and available across sessions.
          </p>
        </div>
        <input
          hidden
          multiple
          type="file"
          onchange={(event) => controller.uploadFiles((event.currentTarget as HTMLInputElement).files)}
        />
      </label>
    </CardContent>
  </Card>

  <Card class="bg-card min-h-0 flex-1 shadow-none">
    <CardHeader>
      <CardTitle>Recent files</CardTitle>
      <CardDescription>Download or inspect the latest uploads from your workstation.</CardDescription>
    </CardHeader>
    <CardContent class="min-h-0 flex-1">
      {#if controller.isFilesLoading}
        <div class="space-y-3">
          {#each Array.from({ length: 4 }) as _, index (index)}
            <Skeleton class="h-18 rounded-lg" />
          {/each}
        </div>
      {:else if controller.files.length === 0}
        <Empty class="bg-muted/20 rounded-lg border">
          <EmptyHeader>
            <EmptyMedia>
              <FilesIcon class="text-muted-foreground size-5" />
            </EmptyMedia>
            <EmptyTitle>No files yet</EmptyTitle>
            <EmptyDescription>
              Upload a file to make it available across your sessions and tabs.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      {:else}
        <ScrollArea class="h-full pr-3">
          <div class="space-y-3">
            {#each controller.files as file (file.path)}
              <button
                class="bg-background hover:bg-muted/40 flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors"
                onclick={() => controller.downloadFile(file.name)}
                type="button"
              >
                <div class="min-w-0 space-y-1">
                  <div class="flex items-center gap-2">
                    <FilesIcon class="text-primary size-4" />
                    <span class="truncate font-medium">{file.name}</span>
                  </div>
                  <div class="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span>{formatSize(file.size)}</span>
                    <span>{dateFormatter.format(file.modifiedAt)}</span>
                  </div>
                </div>
                <Button size="icon-sm" variant="ghost">
                  <Download class="size-4" />
                  <span class="sr-only">Download {file.name}</span>
                </Button>
              </button>
            {/each}
          </div>
        </ScrollArea>
      {/if}
    </CardContent>
  </Card>
</div>
