<script lang="ts">
  import FolderKanban from '@lucide/svelte/icons/folder-kanban';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import Link2 from '@lucide/svelte/icons/link-2';
  import Save from '@lucide/svelte/icons/save';
  import Search from '@lucide/svelte/icons/search';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '$lib/components/ui/empty';
  import * as Field from '$lib/components/ui/field';
  import { Input } from '$lib/components/ui/input';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Button } from '$lib/components/ui/button';
  import { toast } from 'svelte-sonner';
  import type { WorkspaceController } from '$lib/cloudshell/workspace-controller.svelte';

  let { controller }: { controller: WorkspaceController } = $props();

  let shareLookupInput = $state('');
  let sshKeyName = $state('');
  let sshKeyValue = $state('');
  let dockerfile = $state('');

  async function runWithToast(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      toast.error((error as Error).message || 'Unable to complete action');
    }
  }
</script>

<ScrollArea class="h-full pr-3">
  <div class="space-y-8">
    <section class="space-y-3">
      <div class="space-y-1">
        <h3 class="text-base font-semibold">Workspace controls</h3>
        <p class="text-muted-foreground text-sm">Snapshot the current workstation state for this user.</p>
      </div>
      <Button size="lg" class="w-full justify-start" onclick={() => runWithToast(() => controller.backupWorkspace())}>
        <Save />
        <span>Checkpoint workspace</span>
      </Button>
    </section>

    <section class="space-y-4">
      <div class="space-y-1">
        <h3 class="text-base font-semibold">Share links</h3>
        <p class="text-muted-foreground text-sm">Create a read-only share link and inspect existing share tokens.</p>
      </div>
        <Button size="lg" class="w-full justify-start" variant="outline" onclick={() => runWithToast(() => controller.createShareLink())}>
          <Link2 />
          <span>Create share link</span>
        </Button>

        {#if controller.shareLink}
          <Field.Field>
            <Field.Label>Latest share URL</Field.Label>
            <Field.Content>
              <Input readonly value={controller.shareLink} />
            </Field.Content>
          </Field.Field>
        {/if}

        <Field.Field>
          <Field.Label>Lookup by token or URL</Field.Label>
          <Field.Content class="gap-2">
            <Input bind:value={shareLookupInput} placeholder="share token or full URL" />
            <Button
              size="lg"
              class="w-full justify-start"
              variant="outline"
              onclick={() => runWithToast(() => controller.lookupShare(shareLookupInput))}
            >
              <Search />
              <span>Lookup share</span>
            </Button>
          </Field.Content>
        </Field.Field>

        {#if controller.shareLookup}
          <div class="bg-background rounded-lg border px-4 py-3 text-sm">
            <div class="space-y-1">
              <div class="font-medium">{controller.shareLookup.userEmail ?? '(hidden)'}</div>
              <div class="text-muted-foreground">permissions: {controller.shareLookup.permissions}</div>
            </div>
          </div>
        {/if}
    </section>

    <section class="space-y-4">
      <div class="space-y-1">
        <h3 class="text-base font-semibold">SSH keys</h3>
        <p class="text-muted-foreground text-sm">Attach keys for tooling or remotes inside the workstation.</p>
      </div>
        <Field.Field>
          <Field.Label>Key name</Field.Label>
          <Field.Content>
            <Input bind:value={sshKeyName} placeholder="Deploy key" />
          </Field.Content>
        </Field.Field>

        <Field.Field>
          <Field.Label>Public key</Field.Label>
          <Field.Content>
            <Textarea bind:value={sshKeyValue} placeholder="ssh-ed25519 AAAA..." rows={4} />
          </Field.Content>
        </Field.Field>

        <Button size="lg" class="w-full justify-start" onclick={() => runWithToast(async () => {
          await controller.addSshKey(sshKeyName, sshKeyValue);
          sshKeyName = '';
          sshKeyValue = '';
        })}>
          <KeyRound />
          <span>Add SSH key</span>
        </Button>

        {#if controller.isToolsLoading}
          <div class="space-y-3">
            {#each Array.from({ length: 3 }) as _, index (index)}
              <Skeleton class="h-16 rounded-lg" />
            {/each}
          </div>
        {:else if controller.sshKeys.length === 0}
          <Empty class="bg-muted/20 rounded-lg border">
            <EmptyHeader>
              <EmptyMedia>
                <KeyRound class="text-muted-foreground size-5" />
              </EmptyMedia>
              <EmptyTitle>No SSH keys</EmptyTitle>
              <EmptyDescription>Add a key to make it available in your workstation.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        {:else}
          <div class="space-y-3">
            {#each controller.sshKeys as key (key.id)}
              <div class="bg-background flex items-start justify-between gap-3 rounded-lg border px-4 py-3">
                <div class="min-w-0">
                  <div class="font-medium">{key.name}</div>
                  <div class="text-muted-foreground mt-1 truncate text-xs">{key.key}</div>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onclick={() => runWithToast(() => controller.deleteSshKey(key.id))}
                >
                  <Trash2 class="size-4" />
                  <span class="sr-only">Remove {key.name}</span>
                </Button>
              </div>
            {/each}
          </div>
        {/if}
    </section>

    <section class="space-y-4">
      <div class="space-y-1">
        <h3 class="text-base font-semibold">Custom Dockerfile</h3>
        <p class="text-muted-foreground text-sm">Override the container image build for this workstation.</p>
      </div>
        <Textarea bind:value={dockerfile} placeholder="Paste a custom Dockerfile here" rows={10} />
        <Button size="lg" class="w-full justify-start" variant="outline" onclick={() => runWithToast(() => controller.saveDockerfile(dockerfile))}>
          <FolderKanban />
          <span>Save Dockerfile</span>
        </Button>
    </section>
  </div>
</ScrollArea>
