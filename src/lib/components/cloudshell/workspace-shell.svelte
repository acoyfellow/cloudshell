<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$lib/auth-store.svelte';
  import { IsMobile } from '$lib/hooks/is-mobile.svelte';
  import { ResizableHandle, ResizablePane, ResizablePaneGroup } from '$lib/components/ui/resizable';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import type { Session, Tab } from '$lib/cloudshell/types';
  import { WorkspaceController } from '$lib/cloudshell/workspace-controller.svelte';
  import AppToolbar from './app-toolbar.svelte';
  import CommandPalette from './command-palette.svelte';
  import DestructiveConfirm from './destructive-confirm.svelte';
  import SessionDialog from './session-dialog.svelte';
  import SessionSidebar from './session-sidebar.svelte';
  import TabDialog from './tab-dialog.svelte';
  import TabStrip from './tab-strip.svelte';
  import TerminalPane from './terminal-pane.svelte';
  import UtilityPane from './utility-pane.svelte';

  let { email }: { email: string } = $props();

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

  $effect(() => {
    if (!sessionDeleteOpen) {
      sessionToDelete = null;
    }
  });

  $effect(() => {
    if (!tabDeleteOpen) {
      tabToDelete = null;
    }
  });

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
    />

    <Sidebar.Inset class="h-dvh min-h-0 overflow-hidden bg-transparent shadow-none">
      <AppToolbar
        {controller}
        {email}
        onToggleCommand={() => (commandOpen = true)}
        onSignOut={() => authStore.signOut()}
      />

      <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 sm:p-4">
        <TabStrip
          {controller}
          onCreateTab={openCreateTabDialog}
          onRenameTab={openRenameTabDialog}
          onDeleteTab={requestTabDelete}
        />

        {#if controller.isWorkspaceLoading}
          <div class="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Skeleton class="min-h-[32rem] rounded-lg" />
            <div class="hidden gap-4 lg:grid">
              <Skeleton class="h-48 rounded-lg" />
              <Skeleton class="h-full rounded-lg" />
            </div>
          </div>
        {:else}
          <div class="relative min-h-0 flex-1 overflow-hidden">
            {#if isMobile.current}
              <div class="flex h-full min-h-0 flex-1 overflow-hidden">
                <TerminalPane
                  {controller}
                  sessionId={controller.activeSessionId}
                  tabId={controller.activeTabId}
                />
              </div>
            {:else}
              <div class="h-full min-h-0 overflow-hidden">
                {#if controller.utilityPaneOpen}
                  <ResizablePaneGroup direction="horizontal" class="gap-4">
                    <ResizablePane defaultSize={68} minSize={48}>
                      <TerminalPane
                        {controller}
                        sessionId={controller.activeSessionId}
                        tabId={controller.activeTabId}
                      />
                    </ResizablePane>
                    <ResizableHandle class="bg-border/60 hover:bg-primary/40 w-px transition-colors" />
                    <ResizablePane defaultSize={32} minSize={24} maxSize={42}>
                      <UtilityPane {controller} mode="desktop" />
                    </ResizablePane>
                  </ResizablePaneGroup>
                {:else}
                  <TerminalPane
                    {controller}
                    sessionId={controller.activeSessionId}
                    tabId={controller.activeTabId}
                  />
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </Sidebar.Inset>
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

<DestructiveConfirm
  bind:open={sessionDeleteOpen}
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
