import { getStore } from "@netlify/blobs";
import { sendWhatsApp } from "./utils.mjs";

const CLAUDE_KEY = process.env.CLAUDE_KEY;
const WA_PHONE = process.env.WA_PHONE;
const WA_APIKEY = process.env.WA_APIKEY;

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
      system: `Sei un monitor di prodotti Magic: The Gathering. Cerca prodotti MTG DISPONIBILI su ${siteUrl}. Rispondi SOLO:\n## [Nome Prodotto]\n- Status: Available/OutOfStock\n- Price: [prezzo]\n- URL: [link]\n- [Descrizione]\nSolo prodotti IN STOCK.`,
      messages: [{ role: 'user', content: `Cerca su ${siteUrl} prodotti MTG disponibili ora: Collector Booster, Set Booster, Bundle, Commander Deck, Secret Lair. Solo IN STOCK. Oggi: ${new Date().toLocaleDateString('it-IT')}` }]
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  const text = (data.content || []).map(b => b.type === 'text' ? b.text : '').filter(Boolean).join('\n');
  return parseProducts(text, siteName, siteUrl);
}

function parseProducts(text, siteName, siteUrl) {
  const products = []; let cur = null;
  for (const line of text.split('\n')) {
    const t = line.trim(); if (!t) continue;
    if (t.startsWith('##')) {
      if (cur) products.push(cur);
      cur = { title: t.replace(/^#+\s*/, '').trim(), status: 'unknown', price: '', url: '', desc: '', site: siteName, siteUrl };
    } else if (cur) {
      const low = t.toLowerCase();
      if (low.match(/^-\s*status:/)) { const val = t.split(':').slice(1).join(':').trim().toLowerCase(); cur.status = val.includes('available') ? 'available' : 'outofstock'; }
      else if (low.match(/^-\s*(url|link):/)) { const u = t.split(':').slice(1).join(':').trim(); if (u.startsWith('http')) cur.url = u; }
      else if (low.match(/^-\s*price:/)) { cur.price = t.split(':').slice(1).join(':').trim(); }
      else if (!cur.desc && t.length > 15 && !t.startsWith('-')) { cur.desc = t; }
    }
  }
  if (cur) products.push(cur);
  return products.filter(p => p.title && p.status === 'available');
}

export default async () => {
  if (!CLAUDE_KEY) return;
  const store = getStore('sl-monitor');
  let knownKeys = new Set();
  try { const s = await store.get('known-products'); if (s) knownKeys = new Set(JSON.parse(s)); } catch(e) {}

  const sites = [
    { name: 'Secret Lair', url: 'secretlair.wizards.com' },
    { name: 'Game Island', url: 'gameisland.eu' },
    { name: 'Mana Trust', url: 'manatrust.com' }
  ];

  let allProducts = [], newProducts = [];
  for (const site of sites) {
    try {
      const products = await searchSite(site.name, site.url);
      allProducts = [...allProducts, ...products];
      const newOnes = products.filter(p => !knownKeys.has(`${site.name}:${p.title}`));
      newProducts = [...newProducts, ...newOnes];
    } catch(err) { console.error(`Error ${site.name}:`, err.message); }
  }

  if (newProducts.length > 0 && WA_PHONE && WA_APIKEY) {
    const bySite = sites.reduce((acc, s) => { const n = newProducts.filter(p => p.site === s.name); if (n.length) acc[s.name] = n; return acc; }, {});
    for (const [siteName, products] of Object.entries(bySite)) {
      const msg = `🃏 NUOVO MTG su ${siteName}!\n\n` + products.map(p => `✦ ${p.title}\n💰 ${p.price || 'N/D'}\n🛒 ${p.url || p.siteUrl}`).join('\n\n---\n\n');
      await sendWhatsApp(WA_PHONE, WA_APIKEY, msg);
    }
  }

  const allKeys = [...new Set([...knownKeys, ...allProducts.map(p => `${p.site}:${p.title}`)])];
  await store.set('known-products', JSON.stringify(allKeys));
  await store.set('current-products', JSON.stringify(allProducts));
  await store.set('last-check', new Date().toISOString());
};

export const config = { schedule: "*/30 * * * *" };
