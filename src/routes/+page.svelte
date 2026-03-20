<script lang="ts">
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import SquareTerminal from '@lucide/svelte/icons/square-terminal';
  import { toast } from 'svelte-sonner';
  import Workspace from '$lib/cloudshell/Workspace.svelte';
  import { authStore } from '$lib/auth-store.svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import * as Field from '$lib/components/ui/field';
  import { Input } from '$lib/components/ui/input';

  let { data } = $props();

  let email = $state('');
  let password = $state('');

  const currentUser = $derived(authStore.isInitialized ? authStore.user : (data.user ?? null));
  const authResolved = $derived(Boolean(data.authResolved));

  async function handleSignIn() {
    if (!email.trim() || !password.trim()) {
      toast.error('Email and password are required');
      return;
    }

    try {
      await authStore.signIn(email, password);
      email = '';
      password = '';
      toast.success('Signed in');
    } catch (error) {
      toast.error((error as Error).message || 'Sign in failed');
    }
  }

  async function handleSignUp() {
    if (!email.trim() || !password.trim()) {
      toast.error('Email and password are required');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      await authStore.signUp(email, password);
      email = '';
      password = '';
      toast.success('Account created');
    } catch (error) {
      toast.error((error as Error).message || 'Sign up failed');
    }
  }
</script>

<svelte:head>
  <title>cloudshell</title>
</svelte:head>

{#if !authResolved}
  <div class="bg-background flex min-h-dvh items-center justify-center px-4">
    <div class="bg-card flex w-full max-w-sm flex-col items-center gap-4 rounded-lg border px-6 py-8 text-center shadow-none">
      <div class="bg-muted flex size-12 items-center justify-center rounded-md border">
        <LoaderCircle class="size-5 animate-spin" />
      </div>
      <div class="space-y-1">
        <div class="text-sm font-medium">Loading workspace</div>
        <p class="text-muted-foreground text-sm">
          Checking your session and preparing the app shell.
        </p>
      </div>
    </div>
  </div>
{:else if currentUser?.email}
  <Workspace email={currentUser.email} />
{:else}
  <div class="bg-background min-h-dvh">
    <div class="mx-auto flex min-h-dvh w-full max-w-7xl items-center px-4 py-8 sm:px-6 lg:px-8">
      <div class="grid w-full gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-center">
        <section class="hidden max-w-3xl lg:block">
          <div class="text-muted-foreground mb-6 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em]">
            <SquareTerminal class="size-4" />
            Cloudshell
          </div>

          <div class="space-y-6">
            <h1 class="max-w-3xl text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              Sessions on the left.
              <br />
              Tabs in the center.
              <br />
              One user box underneath it all.
            </h1>
            <p class="text-muted-foreground max-w-2xl text-base leading-7">
              A SvelteKit shell with a Cloudflare worker runtime behind it. Shared workstation files,
              isolated session containers, and terminal tabs that reconnect cleanly.
            </p>
          </div>

          <div class="mt-10 grid max-w-3xl gap-4 md:grid-cols-2">
            <div class="bg-card rounded-lg border p-5 shadow-none">
              <div class="mb-3 flex items-center gap-2 text-sm font-medium">
                <ShieldCheck class="size-4" />
                Session isolation
              </div>
              <p class="text-muted-foreground text-sm leading-6">
                Each session gets its own runtime boundary while still seeing the same underlying
                workstation files.
              </p>
            </div>
            <div class="bg-card rounded-lg border p-5 shadow-none">
              <div class="mb-3 flex items-center gap-2 text-sm font-medium">
                <ArrowRight class="size-4" />
                Same-origin app flow
              </div>
              <p class="text-muted-foreground text-sm leading-6">
                SvelteKit owns the UI. The sibling worker owns terminal orchestration, ports,
                files, tools, and recording state.
              </p>
            </div>
          </div>
        </section>

        <Card.Root class="bg-card w-full rounded-lg border shadow-none">
          <Card.Header class="space-y-2 pb-4">
            <div class="text-muted-foreground flex items-center gap-2 text-[0.7rem] font-medium uppercase tracking-[0.22em]">
              <SquareTerminal class="size-4" />
              Cloudshell access
            </div>
            <Card.Title class="text-2xl font-semibold tracking-tight text-white">Open your workstation</Card.Title>
            <Card.Description class="text-sm leading-6">
              Sign in to your private shell, or create an account and provision a fresh user box.
            </Card.Description>
          </Card.Header>

          <Card.Content>
            <form class="space-y-5" onsubmit={(event) => event.preventDefault()}>
              <Field.Field class="space-y-2">
                <Field.Label for="auth-email">Email</Field.Label>
                <Field.Content>
                  <Input
                    id="auth-email"
                    bind:value={email}
                    type="email"
                    autocomplete="email"
                    placeholder="you@example.com"
                    class="h-10"
                  />
                </Field.Content>
              </Field.Field>

              <Field.Field class="space-y-2">
                <Field.Label for="auth-password">Password</Field.Label>
                <Field.Content>
                  <Input
                    id="auth-password"
                    bind:value={password}
                    type="password"
                    autocomplete="current-password"
                    placeholder="minimum 6 characters"
                    class="h-10"
                    onkeydown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleSignIn();
                      }
                    }}
                  />
                </Field.Content>
                <Field.Description>
                  Email/password only for now. Worker-backed runtime, no CDN-loaded terminal assets.
                </Field.Description>
              </Field.Field>
            </form>
          </Card.Content>

          <Card.Footer class="grid gap-3 sm:grid-cols-2">
            <Button size="lg" class="w-full" disabled={authStore.isLoading} onclick={handleSignIn}>
              {authStore.isLoading ? 'Working…' : 'Sign In'}
            </Button>
            <Button
              variant="outline"
              size="lg"
              class="w-full"
              disabled={authStore.isLoading}
              onclick={handleSignUp}
            >
              Create Account
            </Button>
          </Card.Footer>
        </Card.Root>
      </div>
    </div>
  </div>
{/if}
