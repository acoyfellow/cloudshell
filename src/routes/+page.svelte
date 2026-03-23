<script lang="ts">
  import { asset } from '$app/paths';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
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
  <div class="bg-background flex min-h-dvh flex-col items-center justify-center gap-4 px-4">
    <img src={asset('/logo.svg')} alt="" class="size-12" width="48" height="48" />
    <LoaderCircle class="text-muted-foreground size-6 animate-spin" aria-hidden="true" />
  </div>
{:else if currentUser?.email}
  <Workspace />
{:else}
  <div class="bg-background flex min-h-dvh items-center justify-center px-4 py-8">
    <Card.Root class="bg-card w-full max-w-sm rounded-lg border shadow-none">
      <Card.Header class="flex flex-col items-center pb-2 pt-8">
        <img src={asset('/logo.svg')} alt="cloudshell" class="size-14" width="56" height="56" />
      </Card.Header>

      <Card.Content class="py-2">
        <form class="space-y-4" onsubmit={(event) => event.preventDefault()}>
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
                placeholder="••••••••"
                class="h-10"
                onkeydown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleSignIn();
                  }
                }}
              />
            </Field.Content>
          </Field.Field>
        </form>
      </Card.Content>

      <Card.Footer class="grid gap-3 py-3">
        <Button size="lg" class="w-full" disabled={authStore.isLoading} onclick={handleSignIn}>
          {authStore.isLoading ? '…' : 'Sign in'}
        </Button>
        <Button
          variant="outline"
          size="lg"
          class="w-full"
          disabled={authStore.isLoading}
          onclick={handleSignUp}
        >
          Register
        </Button>
      </Card.Footer>
    </Card.Root>
  </div>
{/if}
