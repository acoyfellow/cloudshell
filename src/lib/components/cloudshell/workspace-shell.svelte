<script lang="ts">
  import { onMount } from 'svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import { authStore } from '$lib/auth-store.svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
  } from '$lib/components/ui/empty';
  import { IsMobile } from '$lib/hooks/is-mobile.svelte';
  import { ResizableHandle, ResizablePane, ResizablePaneGroup } from '$lib/components/ui/resizable';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import type { Session, Tab } from '$lib/cloudshell/types';
  import { WorkspaceController } from '$lib/cloudshell/workspace-controller.svelte';
  import AppToolbar from './app-toolbar.svelte';
  import CommandPalette from './command-palette.svelte';
  import DestructiveConfirm from './destructive-confirm.svelte';
  import FilesDrawer from './files-drawer.svelte';
  import SessionDialog from './session-dialog.svelte';
  import SessionSidebar from './session-sidebar.svelte';
  import TabDialog from './tab-dialog.svelte';
  import TerminalPane from './terminal-pane.svelte';
  import TerminalPaneWterm from './terminal-pane-wterm.svelte';

  /**
   * Feature flag: ?terminal=wterm activates the wterm-based renderer
   * (DOM-native, Cmd+F works, native selection, accessibility, real
   * browser scrollbar). Default stays on xterm while the spike hardens.
   * Evaluated once at mount; page reload required to switch.
   */
  const useWterm =
    typeof window !== 'undefined' &&
    new URL(window.location.href).searchParams.get('terminal') === 'wterm';
  import UtilityPane from './utility-pane.svelte';
  import LoadingPane from './loading-pane.svelte';

  const controller = new WorkspaceController();
  const isMobile = new IsMobile();

  let commandOpen = $state(false);
  let sessionDialogOpen = $state(false);
  let sessionDialogMode = $state<'create' | 'rename'>('create');
  let sessionDraft = $state<{ id: string; name: string }>({ id: '', name: '' });
  let tabDialogOpen = $state(false);
  let tabDialogMode = $state<'create' | 'rename'>('create');
  let tabDraft = $state<{ id: string; name: string }>({ id: '', name: '' });
  let sessionToDelete = $state<Session | null>(null);
  let tabToDelete = $state<Tab | null>(null);
  let sessionDeleteOpen = $state(false);
  let tabDeleteOpen = $state(false);
  let signOutConfirmOpen = $state(false);
  let aboutOpen = $state(false);

  function openCreateSessionDialog() {
    sessionDialogMode = 'create';
    sessionDraft = { id: '', name: '' };
    sessionDialogOpen = true;
  }

  function openRenameSessionDialog(session: Session) {
    sessionDialogMode = 'rename';
    sessionDraft = { id: session.id, name: session.name };
    sessionDialogOpen = true;
  }

  function openCreateTabDialog() {
    tabDialogMode = 'create';
    tabDraft = { id: '', name: '' };
    tabDialogOpen = true;
  }

  function openRenameTabDialog(tab: Tab) {
    tabDialogMode = 'rename';
    tabDraft = { id: tab.id, name: tab.name };
    tabDialogOpen = true;
  }

  function requestSessionDelete(session: Session) {
    sessionToDelete = session;
    sessionDeleteOpen = true;
  }

  function requestTabDelete(tab: Tab) {
    tabToDelete = tab;
    tabDeleteOpen = true;
  }

  function requestSignOut() {
    signOutConfirmOpen = true;
  }

  function openAbout() {
    aboutOpen = true;
  }

  async function submitSession(name: string) {
    if (sessionDialogMode === 'create') {
      await controller.createSession(name);
      return;
    }

    await controller.renameSession(sessionDraft.id, name);
  }

  async function submitTab(name: string) {
    if (tabDialogMode === 'create') {
      await controller.createTab(name);
      return;
    }

    await controller.renameTab(tabDraft.id, name);
  }

  onMount(() => {
    const onBeforeUnload = () => {
      void controller.checkpointActiveSession({ keepalive: true });
    };

    const onKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        commandOpen = !commandOpen;
      }
    };

    void controller.initialize();
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('keydown', onKeydown);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('keydown', onKeydown);
    };
  });
</script>

<Sidebar.Provider>
  <div class="bg-background text-foreground flex h-dvh min-h-0 w-full overflow-hidden">
    <SessionSidebar
      {controller}
      onCreateSession={openCreateSessionDialog}
      onRenameSession={openRenameSessionDialog}
      onDeleteSession={requestSessionDelete}
      onOpenAbout={openAbout}
      onSignOut={requestSignOut}
    />

    <Sidebar.Inset class="h-dvh min-h-0 overflow-hidden bg-black shadow-none">
      <AppToolbar
        {controller}
        onCreateTab={openCreateTabDialog}
        onRenameTab={openRenameTabDialog}
        onDeleteTab={requestTabDelete}
        onToggleCommand={() => (commandOpen = true)}
      />

      <div class="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-3 sm:p-4">
        {#if controller.isWorkspaceLoading}
          <div class="relative min-h-0 flex-1 overflow-hidden bg-black">
            <LoadingPane
              title="Loading workspace"
              description="Restoring sessions, tabs, and terminal state."
            />
          </div>
        {:else if controller.sessions.length === 0}
          <Empty class="min-h-0 flex-1 border-0 bg-transparent">
            <EmptyHeader>
              <EmptyTitle>No sessions yet</EmptyTitle>
              <EmptyDescription>
                Create a session to start a new isolated runtime with its own tabs and terminal state.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="lg" class="min-w-48" onclick={openCreateSessionDialog}>
                <Plus />
                <span>Create session</span>
              </Button>
            </EmptyContent>
          </Empty>
        {:else if controller.tabs.length === 0 || !controller.activeTabId}
          <Empty class="min-h-0 flex-1 border-0 bg-transparent">
            <EmptyHeader>
              <EmptyTitle>No tabs in this session</EmptyTitle>
              <EmptyDescription>
                This session does not have an active terminal tab yet.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="lg" class="min-w-48" onclick={openCreateTabDialog}>
                <Plus />
                <span>Create tab</span>
              </Button>
            </EmptyContent>
          </Empty>
        {:else}
          <div class="relative min-h-0 flex-1 overflow-hidden">
            {#if isMobile.current}
              <div class="flex h-full min-h-0 flex-1 overflow-hidden">
                {#key `${controller.activeSessionId}-${controller.activeTabId}`}
                  {#if useWterm}
                    <TerminalPaneWterm
                      {controller}
                      sessionId={controller.activeSessionId}
                      tabId={controller.activeTabId}
                    />
                  {:else}
                    <TerminalPane
                      {controller}
                      sessionId={controller.activeSessionId}
                      tabId={controller.activeTabId}
                    />
                  {/if}
                {/key}
              </div>
            {:else}
              <div class="h-full min-h-0 overflow-hidden">
                <ResizablePaneGroup direction="horizontal" class="gap-4">
                  <ResizablePane
                    defaultSize={controller.utilityPaneOpen ? 68 : 100}
                    minSize={48}
                  >
                    {#key `${controller.activeSessionId}-${controller.activeTabId}`}
                      {#if useWterm}
                        <TerminalPaneWterm
                          {controller}
                          sessionId={controller.activeSessionId}
                          tabId={controller.activeTabId}
                        />
                      {:else}
                        <TerminalPane
                          {controller}
                          sessionId={controller.activeSessionId}
                          tabId={controller.activeTabId}
                        />
                      {/if}
                    {/key}
                  </ResizablePane>
                  {#if controller.utilityPaneOpen}
                    <ResizableHandle class="bg-border/60 hover:bg-primary/40 w-px transition-colors" />
                    <ResizablePane defaultSize={32} minSize={24} maxSize={42}>
                      <UtilityPane {controller} mode="desktop" />
                    </ResizablePane>
                  {/if}
                </ResizablePaneGroup>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </Sidebar.Inset>

    <FilesDrawer {controller} />
  </div>

  <UtilityPane {controller} mode="mobile" />
</Sidebar.Provider>

<CommandPalette
  bind:open={commandOpen}
  {controller}
  onCreateSession={openCreateSessionDialog}
  onCreateTab={openCreateTabDialog}
  onRenameSession={openRenameSessionDialog}
  onRenameTab={openRenameTabDialog}
  onSignOut={() => authStore.signOut()}
/>

<SessionDialog
  bind:open={sessionDialogOpen}
  mode={sessionDialogMode}
  initialName={sessionDraft.name}
  onSubmit={submitSession}
/>

<TabDialog
  bind:open={tabDialogOpen}
  mode={tabDialogMode}
  initialName={tabDraft.name}
  onSubmit={submitTab}
/>

<Dialog.Root bind:open={aboutOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>About Cloudshell</Dialog.Title>
      <Dialog.Description>
        Cloudshell gives you isolated sessions with per-tab terminal state on a shared workstation.
      </Dialog.Description>
    </Dialog.Header>

    <div class="text-muted-foreground space-y-3 text-sm">
      <p>Each session runs as its own isolated runtime.</p>
      <p>Each tab keeps its own terminal state inside that session.</p>
      <p>The shared workstation stays available across all of your sessions.</p>
    </div>

    <Dialog.Footer class="mt-4">
      <Button variant="outline" onclick={() => (aboutOpen = false)}>Close</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<DestructiveConfirm
  bind:open={sessionDeleteOpen}
  onOpenChange={(open: boolean) => {
    if (!open) sessionToDelete = null;
  }}
  title="Delete session?"
  description={
    sessionToDelete
      ? `This removes ${sessionToDelete.name} and all of its tabs, runtime state, and forwarded ports.`
      : ''
  }
  confirmLabel="Delete session"
  onConfirm={async () => {
    if (sessionToDelete) {
      await controller.deleteSession(sessionToDelete.id);
      sessionToDelete = null;
      sessionDeleteOpen = false;
    }
  }}
/>

<DestructiveConfirm
  bind:open={tabDeleteOpen}
  onOpenChange={(open: boolean) => {
    if (!open) tabToDelete = null;
  }}
  title="Close tab?"
  description={
    tabToDelete
      ? `This closes ${tabToDelete.name} and removes its saved terminal state from the active session.`
      : ''
  }
  confirmLabel="Close tab"
  onConfirm={async () => {
    if (tabToDelete) {
      await controller.deleteTab(tabToDelete.id);
      tabToDelete = null;
      tabDeleteOpen = false;
    }
  }}
/>

<DestructiveConfirm
  bind:open={signOutConfirmOpen}
  title="Sign out?"
  description="You’ll leave this workspace and need to sign in again to reconnect."
  confirmLabel="Sign out"
  onConfirm={async () => {
    await authStore.signOut();
  }}
/>
