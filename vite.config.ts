import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  ssr: {
    noExternal: ['@lucide/svelte', 'svelte-sonner']
  },
  server: {
    allowedHosts: ['host.docker.internal'],
    watch: {
      ignored: ['**/.alchemy/**']
    }
  }
});
