import { getStore } from "@netlify/blobs";
import { checkDropsWithClaude } from "../../lib/utils.mjs";

const CLAUDE_KEY = process.env.CLAUDE_KEY;

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { headers: HEADERS });

  const url = new URL(req.url);
  const refresh = url.searchParams.get('refresh') === '1';
  const store = getStore('sl-monitor');

  if (!refresh) {
    try {
      const cached = await store.get('current-drops');
      const lastCheck = await store.get('last-check');
      if (cached) {
        return new Response(JSON.stringify({ drops: JSON.parse(cached), lastCheck, cached: true }), { headers: HEADERS });
      }
    } catch(e) {}
  }

  if (!CLAUDE_KEY) {
    return new Response(JSON.stringify({ error: 'CLAUDE_KEY not configured in Netlify environment variables' }), { status: 500, headers: HEADERS });
  }

  try {
    const drops = await checkDropsWithClaude(CLAUDE_KEY);
    const now = new Date().toISOString();
    await store.set('current-drops', JSON.stringify(drops));
    await store.set('last-check', now);
    return new Response(JSON.stringify({ drops, lastCheck: now, cached: false }), { headers: HEADERS });
  } catch(err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: HEADERS });
  }
};
