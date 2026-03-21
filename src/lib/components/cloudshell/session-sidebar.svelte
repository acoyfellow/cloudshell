<script lang="ts">
  import MoreHorizontal from '@lucide/svelte/icons/ellipsis';
  import PenSquare from '@lucide/svelte/icons/pen-square';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import type { WorkspaceController } from '$lib/cloudshell/workspace-controller.svelte';
  import type { Session } from '$lib/cloudshell/types';

  let {
    controller,
    onCreateSession,
    onRenameSession,
    onDeleteSession,
  }: {
    controller: WorkspaceController;
    onCreateSession: () => void;
    onRenameSession: (session: Session) => void;
    onDeleteSession: (session: Session) => void;
  } = $props();

  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
</script>

<Sidebar.Root
  side="left"
  variant="sidebar"
  collapsible="offcanvas"
  class="bg-sidebar overflow-x-hidden border-r"
>
  <Sidebar.Content class="overflow-hidden">
    <ScrollArea class="h-full overflow-x-hidden">
      <Sidebar.Group class="p-0">
        <Sidebar.Menu class="space-y-1">
          {#if controller.isWorkspaceLoading}
            {#each Array.from({ length: 4 }) as _, index (index)}
              <div class="px-3 py-3">
                <Skeleton class="mb-2 h-4 w-24" />
                <Skeleton class="h-3 w-32" />
              </div>
            {/each}
          {:else}
            {#each controller.sessions as session (session.id)}
              <Sidebar.MenuItem>
                <Sidebar.MenuButton
                  isActive={session.id === controller.activeSessionId}
                  size="lg"
                  class="h-auto min-h-16 rounded-none border-0 px-3 py-3 data-active:bg-sidebar-accent/70"
                  onclick={() => controller.switchSession(session.id)}
                >
                  <div class="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <span class="truncate font-medium">{session.name}</span>
                    <span class="text-muted-foreground text-[0.72rem] uppercase tracking-[0.1em]">
                      last active {formatter.format(session.lastOpenedAt)}
                    </span>
                  </div>
                </Sidebar.MenuButton>

                <DropdownMenu.Root>
                  <DropdownMenu.Trigger
                    class="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground absolute top-3 right-2 inline-flex size-7 items-center justify-center rounded-md transition-colors"
                  >
                    <MoreHorizontal class="size-4" />
                    <span class="sr-only">Session actions</span>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="end" class="w-44">
                    <DropdownMenu.Item onclick={() => onRenameSession(session)}>
                      <PenSquare class="size-4" />
                      <span>Rename</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item
                      class="text-destructive focus:text-destructive"
                      onclick={() => onDeleteSession(session)}
                    >
                      <Trash2 class="size-4" />
                      <span>Delete</span>
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </Sidebar.MenuItem>
            {/each}
          {/if}
        </Sidebar.Menu>
      </Sidebar.Group>
    </ScrollArea>
  </Sidebar.Content>

  <Sidebar.Footer class="items-end p-2">
    <Button size="icon-sm" variant="outline" onclick={onCreateSession}>
      <Plus />
      <span class="sr-only">Create session</span>
    </Button>
  </Sidebar.Footer>
</Sidebar.Root>
