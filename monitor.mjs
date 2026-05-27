import { getStore } from "@netlify/blobs";

const CLAUDE_KEY = process.env.CLAUDE_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(msg) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg })
  });
}

async function searchSite(siteName, siteUrl) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `Trova prodotti Magic: The Gathering IN STOCK su ${siteUrl}. Rispondi SOLO:\n## [Nome]\n- Price: [prezzo]\n- URL: [link]\nSolo prodotti acquistabili ora.`,
      messages: [{ role: 'user', content: `Prodotti MTG disponibili su ${siteUrl} oggi: Collector Booster, Set Booster, Bundle, Commander, Secret Lair. Solo IN STOCK. ${new Date().toLocaleDateString('it-IT')}` }]
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  const text = (data.content || []).map(b => b.type === 'text' ? b.text : '').filter(Boolean).join('\n');
  const products = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const t = line.trim(); if (!t) continue;
    if (t.startsWith('##')) {
      if (cur) products.push(cur);
      cur = { title: t.replace(/^#+\s*/, '').trim(), price: '', url: '', site: siteName };
    } else if (cur) {
      const low = t.toLowerCase();
      if (low.match(/^-\s*(url|link):/)) { const u = t.split(':').slice(1).join(':').trim(); if (u.startsWith('http')) cur.url = u; }
      else if (low.match(/^-\s*price:/)) { cur.price = t.split(':').slice(1).join(':').trim(); }
    }
  }
  if (cur) products.push(cur);
  return products.filter(p => p.title);
}

export default async () => {
  if (!CLAUDE_KEY || !TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;

  await sendTelegram(`🔍 Monitor avviato - cerco prodotti...`);

  const store = getStore('sl-monitor');
  let knownKeys = [];
  try { const s = await store.get('known-keys'); if (s) knownKeys = JSON.parse(s); } catch(e) {}

  const sites = [
    { name: 'Secret Lair', url: 'secretlair.wizards.com' },
    { name: 'Game Island', url: 'gameisland.eu' },
    { name: 'Mana Trust', url: 'manatrust.com' }
  ];

  let allProducts = [];
  for (const site of sites) {
    await new Promise(r => setTimeout(r, 60000));
    try {
      const products = await searchSite(site.name, site.url);
      allProducts = [...allProducts, ...products];
    } catch(err) {
      await sendTelegram(`❌ Errore ${site.name}: ${err.message}`);
    }
  }

  const newProducts = allProducts.filter(p => !knownKeys.includes(`${p.site}:${p.title}`));
  await sendTelegram(`✅ Trovati ${allProducts.length} prodotti totali, ${newProducts.length} nuovi`);

  if (newProducts.length > 0) {
    for (const p of newProducts) {
      const msg = `🃏 MTG DISPONIBILE su ${p.site}!\n\n✦ ${p.title}\n💰 ${p.price || 'N/D'}\n🛒 ${p.url || ''}`;
      await sendTelegram(msg);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const allKeys = [...new Set([...knownKeys, ...allProducts.map(p => `${p.site}:${p.title}`)])];
  await store.set('known-keys', JSON.stringify(allKeys));
};

export const config = { schedule: "*/30 * * * *" };
