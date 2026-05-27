import { getStore } from "@netlify/blobs";
import { checkDropsWithClaude, sendWhatsApp } from "./utils.mjs";

const CLAUDE_KEY = process.env.CLAUDE_KEY;
const WA_PHONE = process.env.WA_PHONE;
const WA_APIKEY = process.env.WA_APIKEY;

export default async () => {
  if (!CLAUDE_KEY) { console.error('CLAUDE_KEY not set'); return; }

  const store = getStore('sl-monitor');

  let knownLiveTitles = new Set();
  try {
    const stored = await store.get('known-live-titles');
    if (stored) knownLiveTitles = new Set(JSON.parse(stored));
  } catch(e) {}

  let drops;
  try {
    drops = await checkDropsWithClaude(CLAUDE_KEY);
  } catch(err) {
    console.error('Claude API error:', err.message);
    return;
  }

  const liveDrops = drops.filter(d => d.status === 'live');
  const newLive = liveDrops.filter(d => !knownLiveTitles.has(d.title));

  if (newLive.length > 0 && WA_PHONE && WA_APIKEY) {
    const msg = '⚔️ NUOVO SECRET LAIR DISPONIBILE!\n\n' +
      newLive.map(d =>
        `✦ ${d.title}\n💰 ${d.price || 'N/D'}\n📅 ${d.dates || ''}\n🛒 ${d.url || 'https://secretlair.wizards.com'}`
      ).join('\n\n---\n\n');
    await sendWhatsApp(WA_PHONE, WA_APIKEY, msg);
    console.log(`Sent WA for ${newLive.length} new drops`);
  }

  const allLiveTitles = [...new Set([...knownLiveTitles, ...liveDrops.map(d => d.title)])];
  await store.set('known-live-titles', JSON.stringify(allLiveTitles));
  await store.set('current-drops', JSON.stringify(drops));
  await store.set('last-check', new Date().toISOString());

  console.log(`Monitor: ${drops.length} drops found, ${newLive.length} new live`);
};

export const config = {
  schedule: "*/30 * * * *"
};
