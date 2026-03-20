<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Shared Cloudshell Access</title>
</svelte:head>

<div class="sharePage">
  <div class="shareCard">
    <div class="eyebrow">shared access</div>
    <h1>Cloudshell Share Link</h1>
    <p>This link exposes metadata about a shared workspace.</p>

    <dl>
      <div>
        <dt>token</dt>
        <dd>{data.token}</dd>
      </div>
      <div>
        <dt>permissions</dt>
        <dd>{data.share.permissions}</dd>
      </div>
      <div>
        <dt>owner</dt>
        <dd>{data.share.userEmail ?? data.share.userId}</dd>
      </div>
    </dl>
  </div>
</div>

<style>
  .sharePage {
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: #0b0b0b;
    color: #efefef;
    padding: 32px;
  }

  .shareCard {
    width: min(520px, 100%);
    background: #151515;
    border: 1px solid #2b2b2b;
    border-radius: 16px;
    padding: 24px;
  }

  .eyebrow,
  dt {
    color: #8f8f8f;
    text-transform: uppercase;
    font: 12px/1.4 monospace;
  }

  h1 {
    margin: 8px 0 10px;
  }

  dl {
    display: grid;
    gap: 16px;
    margin-top: 20px;
  }

  dd {
    margin: 4px 0 0;
    word-break: break-word;
  }
</style>
