<script lang="ts">
  import KeyRound from '@lucide/svelte/icons/key-round';
  import Link2 from '@lucide/svelte/icons/link-2';
  import Plug from '@lucide/svelte/icons/plug';
  import Save from '@lucide/svelte/icons/save';
  import Search from '@lucide/svelte/icons/search';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { onMount } from 'svelte';
  import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '$lib/components/ui/empty';
  import * as Field from '$lib/components/ui/field';
  import { Input } from '$lib/components/ui/input';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Button } from '$lib/components/ui/button';
  import { toast } from 'svelte-sonner';
  import type { WorkspaceController } from '$lib/cloudshell/workspace-controller.svelte';
  import LoadingPane from './loading-pane.svelte';

  let { controller }: { controller: WorkspaceController } = $props();

  let shareLookupInput = $state('');
  let sshKeyName = $state('');
  let sshKeyValue = $state('');

  // MCP server connections state. Fetched directly from the CLI's
  // /api/mcp/connections endpoint (which is bridge-ticket gated),
  // but the UI is a signed-in browser context, so we have Better Auth
  // — mint a ticket on demand and use it. That keeps the same
  // endpoint serving both paths: shell CLI and UI.
  let mcpServerInput = $state('');
  let mcpConnections = $state<Array<{ serverId: string; connectedAt: number }>>([]);
  let mcpBusy = $state(false);
  let popupListener: ((event: MessageEvent) => void) | null = null;

  async function mintBridgeTicket(): Promise<string | null> {
    const res = await fetch('/api/cloudshell/ticket/mint-bridge', {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ticket?: string };
    return data.ticket ?? null;
  }

  async function refreshMcpConnections() {
    const ticket = await mintBridgeTicket();
    if (!ticket) {
      mcpConnections = [];
      return;
    }
    const res = await fetch('/api/mcp/connections', {
      headers: { 'X-Cloudshell-Ticket': ticket },
    });
    if (!res.ok) {
      mcpConnections = [];
      return;
    }
    const data = (await res.json()) as {
      connections?: Array<{ serverId: string; connectedAt: number }>;
    };
    mcpConnections = data.connections ?? [];
  }

  async function connectMcpServer() {
    const serverUrl = mcpServerInput.trim();
    if (!serverUrl) {
      toast.error('Enter an MCP server URL');
      return;
    }
    mcpBusy = true;
    try {
      const res = await fetch('/api/mcp/oauth/start', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serverUrl }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        status: 'redirect' | 'already_connected';
        authorizeUrl?: string;
      };
      if (data.status === 'already_connected') {
        toast.success(`Already connected to ${serverUrl}`);
        await refreshMcpConnections();
        return;
      }
      if (data.status === 'redirect' && data.authorizeUrl) {
        // Open the upstream MCP server's consent screen in a popup.
        // Callback lands on our own /api/mcp/oauth/callback, which
        // renders a popup page that postMessages the outcome back.
        const popup = window.open(
          data.authorizeUrl,
          'cloudshell-mcp-oauth',
          'popup,width=520,height=640'
        );
        if (!popup) {
          toast.error('Popup blocked — allow popups and try again');
          return;
        }
        // Listen for completion message from the callback page.
        popupListener?.(new MessageEvent('message'));
        popupListener = async (ev) => {
          if (ev.origin !== window.location.origin) return;
          const payload = (ev.data as { source?: string; payload?: unknown })
            ?.payload;
          if (
            !payload ||
            (ev.data as { source?: string }).source !== 'cloudshell-mcp-oauth'
          )
            return;
          window.removeEventListener('message', popupListener!);
          popupListener = null;
          const result = payload as { ok: boolean; error?: string; serverUrl?: string };
          if (result.ok) {
            toast.success(`Connected to ${result.serverUrl ?? serverUrl}`);
            mcpServerInput = '';
            await refreshMcpConnections();
          } else {
            toast.error(result.error || 'Connection failed');
          }
        };
        window.addEventListener('message', popupListener);
      }
    } catch (error) {
      toast.error((error as Error).message || 'Unable to start OAuth');
    } finally {
      mcpBusy = false;
    }
  }

  onMount(() => {
    void refreshMcpConnections();
    return () => {
      if (popupListener) {
        window.removeEventListener('message', popupListener);
        popupListener = null;
      }
    };
  });

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
        <h3 class="text-base font-semibold">MCP servers</h3>
        <p class="text-muted-foreground text-sm">
          Connect Model Context Protocol servers. Authorized servers are
          reachable from this workstation via the <code class="bg-muted/50 rounded px-1">mcp</code> CLI.
          Your OAuth tokens never enter the container.
        </p>
      </div>

      <Field.Field>
        <Field.Label>MCP server URL</Field.Label>
        <Field.Content class="gap-2">
          <Input
            bind:value={mcpServerInput}
            placeholder="https://mcp.apify.com"
            disabled={mcpBusy}
          />
          <Button
            size="lg"
            class="w-full justify-start"
            onclick={connectMcpServer}
            disabled={mcpBusy}
          >
            <Plug />
            <span>{mcpBusy ? 'Connecting…' : 'Connect MCP server'}</span>
          </Button>
        </Field.Content>
      </Field.Field>

      {#if mcpConnections.length === 0}
        <Empty class="bg-muted/20 rounded-lg border">
          <EmptyHeader>
            <EmptyMedia>
              <Plug class="text-muted-foreground size-5" />
            </EmptyMedia>
            <EmptyTitle>No MCP servers connected</EmptyTitle>
            <EmptyDescription>
              Paste an MCP server URL above, or run <code class="bg-muted/50 rounded px-1">mcp login &lt;url&gt;</code> in the shell.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      {:else}
        <div class="space-y-3">
          {#each mcpConnections as connection (connection.serverId)}
            <div class="bg-background flex items-start justify-between gap-3 rounded-lg border px-4 py-3">
              <div class="min-w-0">
                <div class="font-medium truncate">{connection.serverId}</div>
                <div class="text-muted-foreground mt-1 text-xs">
                  connected {new Date(connection.connectedAt).toISOString()}
                </div>
              </div>
            </div>
          {/each}
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
          <div class="h-32">
            <LoadingPane compact />
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
  </div>
</ScrollArea>
