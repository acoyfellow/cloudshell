<script lang="ts">
  import Cable from '@lucide/svelte/icons/cable';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import FolderOpen from '@lucide/svelte/icons/folder-open';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import LogOut from '@lucide/svelte/icons/log-out';
  import Plus from '@lucide/svelte/icons/plus';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import Search from '@lucide/svelte/icons/search';
  import SquareTerminal from '@lucide/svelte/icons/square-terminal';
  import Wrench from '@lucide/svelte/icons/wrench';
  import {
    Command,
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
  } from '$lib/components/ui/command';
  import type { WorkspaceController } from '$lib/cloudshell/workspace-controller.svelte';
  import type { Session, Tab } from '$lib/cloudshell/types';

  let {
    open = $bindable(false),
    controller,
    onCreateSession,
    onCreateTab,
    onRenameSession,
    onRenameTab,
    onSignOut,
  }: {
    open?: boolean;
    controller: WorkspaceController;
    onCreateSession: () => void;
    onCreateTab: () => void;
    onRenameSession: (session: Session) => void;
    onRenameTab: (tab: Tab) => void;
    onSignOut: () => void;
  } = $props();

  function closeAnd(run: () => void | Promise<void>) {
    open = false;
    void run();
  }
</script>

<CommandDialog bind:open class="border-white/10">
  <Command class="bg-card text-card-foreground">
    <CommandInput placeholder="Search actions, sessions, tabs, and tools…" />
    <CommandList class="max-h-[min(70vh,32rem)]">
      <CommandEmpty>No matching action.</CommandEmpty>

      <CommandGroup heading="Quick actions">
        <CommandItem onSelect={() => closeAnd(onCreateSession)}>
          <Plus />
          <span>Create session</span>
          <CommandShortcut>⇧⌘S</CommandShortcut>
        </CommandItem>
        {#if controller.activeSessionId}
          <CommandItem onSelect={() => closeAnd(onCreateTab)}>
            <Plus />
            <span>Create tab</span>
            <CommandShortcut>⇧⌘T</CommandShortcut>
          </CommandItem>
        {/if}
        <CommandItem onSelect={() => closeAnd(() => controller.backupWorkspace())}>
          <RefreshCw />
          <span>Checkpoint workspace</span>
        </CommandItem>
        <CommandItem onSelect={() => closeAnd(() => controller.toggleRecording())}>
          <CircleDot />
          <span>{controller.isRecording ? 'Stop recording' : 'Start recording'}</span>
        </CommandItem>
      </CommandGroup>

      <CommandSeparator />

      <CommandGroup heading="Panels">
        <CommandItem onSelect={() => closeAnd(() => controller.openFilesDrawer())}>
          <FolderOpen />
          <span>Open files</span>
        </CommandItem>
        <CommandItem onSelect={() => closeAnd(() => controller.openUtilityPane('ports'))}>
          <Cable />
          <span>Open ports</span>
        </CommandItem>
        <CommandItem onSelect={() => closeAnd(() => controller.openUtilityPane('tools'))}>
          <Wrench />
          <span>Open tools</span>
        </CommandItem>
      </CommandGroup>

      <CommandSeparator />

      <CommandGroup heading="Sessions">
        {#each controller.sessions as session (session.id)}
          <CommandItem onSelect={() => closeAnd(() => controller.switchSession(session.id))}>
            <SquareTerminal />
            <span>{session.name}</span>
            {#if session.id === controller.activeSessionId}
              <CommandShortcut>Active</CommandShortcut>
            {/if}
          </CommandItem>
        {/each}
        {#if controller.activeSession}
          <CommandItem onSelect={() => closeAnd(() => onRenameSession(controller.activeSession!))}>
            <KeyRound />
            <span>Rename current session</span>
          </CommandItem>
        {/if}
      </CommandGroup>

      <CommandSeparator />

      <CommandGroup heading="Tabs">
        {#each controller.tabs as tab (tab.id)}
          <CommandItem onSelect={() => closeAnd(() => controller.setActiveTab(tab.id))}>
            <SquareTerminal />
            <span>{tab.name}</span>
            {#if tab.id === controller.activeTabId}
              <CommandShortcut>Active</CommandShortcut>
            {/if}
          </CommandItem>
        {/each}
        {#if controller.activeTab}
          <CommandItem onSelect={() => closeAnd(() => onRenameTab(controller.activeTab!))}>
            <KeyRound />
            <span>Rename current tab</span>
          </CommandItem>
        {/if}
      </CommandGroup>

      <CommandSeparator />

      <CommandGroup heading="Account">
        <CommandItem onSelect={() => closeAnd(onSignOut)}>
          <LogOut />
          <span>Logout</span>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </Command>
</CommandDialog>
