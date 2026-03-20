import { error } from '@sveltejs/kit';
import type { ShareLookup } from '$lib/cloudshell/types';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
  const response = await fetch(`/api/share/${params.token}`);
  const payload = (await response.json()) as ShareLookup | { error?: string };

  if (!response.ok) {
    throw error(response.status, ('error' in payload ? payload.error : undefined) || 'Share lookup failed');
  }

  return {
    share: payload as ShareLookup,
    token: params.token,
  };
};
