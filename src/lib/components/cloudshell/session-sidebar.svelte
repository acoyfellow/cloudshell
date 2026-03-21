<script lang="ts">
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import FolderOpen from '@lucide/svelte/icons/folder-open';
  import Info from '@lucide/svelte/icons/info';
  import LogOut from '@lucide/svelte/icons/log-out';
  import MoreHorizontal from '@lucide/svelte/icons/ellipsis';
  import PenSquare from '@lucide/svelte/icons/pen-square';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import type { WorkspaceController } from '$lib/cloudshell/workspace-controller.svelte';
  import type { Session } from '$lib/cloudshell/types';
  import LoadingPane from './loading-pane.svelte';

  let {
    controller,
    onCreateSession,
    onRenameSession,
    onDeleteSession,
    onOpenAbout,
    onSignOut,
  }: {
    controller: WorkspaceController;
    onCreateSession: () => void;
    onRenameSession: (session: Session) => void;
    onDeleteSession: (session: Session) => void;
    onOpenAbout: () => void;
    onSignOut: () => void;
  } = $props();

  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  const GITHUB_URL = 'https://github.com/acoyfellow/cloudshell';
</script>

<Sidebar.Root
  side="left"
  variant="sidebar"
  collapsible="offcanvas"
  class="bg-sidebar overflow-x-hidden border-r"
>
  <Sidebar.Header class="border-b border-border/40 p-0">
    <div class="flex h-16 items-center gap-1 px-2">
      <Button
        size="icon"
        variant={controller.filesDrawerOpen ? 'default' : 'ghost'}
        class="thumb-icon-target hit-area-2 shrink-0 rounded-xl"
        aria-label={controller.filesDrawerOpen ? 'Close files' : 'Open files'}
        title={controller.filesDrawerOpen ? 'Close files' : 'Open files'}
        onclick={() => void controller.toggleFilesDrawer()}
      >
        <FolderOpen />
        <span class="sr-only">{controller.filesDrawerOpen ? 'Close files' : 'Open files'}</span>
      </Button>
      <Button
        variant="ghost"
        class="h-16 min-w-0 flex-1 justify-center rounded-none border-0 px-0"
        onclick={onCreateSession}
      >
        <Plus />
        <span class="sr-only">Create session</span>
      </Button>
    </div>
  </Sidebar.Header>

  <Sidebar.Content class="min-h-0 overflow-hidden">
    <div class="flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden">
      <Sidebar.Group class="p-0">
        <Sidebar.Menu class="space-y-1">
          {#if controller.isWorkspaceLoading}
            <div class="flex h-32 items-center justify-center px-3 py-4">
              <LoadingPane compact />
            </div>
          {:else}
            {#each controller.sessions as session (session.id)}
              <Sidebar.MenuItem>
                <Sidebar.MenuButton
                  isActive={session.id === controller.activeSessionId}
                  size="lg"
                  class="h-auto min-h-16 rounded-none border-0 pl-3 pr-10 py-3 data-active:bg-sidebar-accent/70"
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
                    class="!absolute text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground top-3 right-2 inline-flex size-7 items-center justify-center rounded-md transition-colors"
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
    </div>
  </Sidebar.Content>

  <Sidebar.Footer class="mt-auto border-t border-border/40 p-2">
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        class="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground inline-flex size-10 items-center justify-center rounded-xl transition-colors"
        aria-label="Open workspace menu"
      >
        <MoreHorizontal class="size-5" />
        <span class="sr-only">Open workspace menu</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" side="top" class="w-48">
        <DropdownMenu.Item onclick={onOpenAbout}>
          <Info class="size-4" />
          <span>About</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item
          onclick={() => window.open(GITHUB_URL, '_blank', 'noopener,noreferrer')}
        >
          <ArrowUpRight class="size-4" />
          <span>GitHub</span>
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item
          class="text-destructive focus:text-destructive"
          onclick={onSignOut}
        >
          <LogOut class="size-4" />
          <span>Sign out</span>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </Sidebar.Footer>
</Sidebar.Root>
