import { getStore } from "@netlify/blobs";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(msg) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg })
  });
}

async function scrapeSecretLair() {
  const r = await fetch('https://secretlair.wizards.com', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await r.text();
  const products = [];
  const regex = /href="(\/products\/[^"]+)"[^>]*>[\s\S]*?<[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const url = 'https://secretlair.wizards.com' + match[1];
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    if (title && title.length > 3) products.push({ title, url, site: 'Secret Lair', price: '' });
  }
  return products;
}

async function scrapeGeneric(siteUrl, siteName) {
  const r = await fetch(`https://${siteUrl}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await r.text();
  const products = [];
  const keywords = ['collector booster', 'set booster', 'bundle', 'commander', 'draft booster', 'magic'];
  const regex = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const text = match[2].replace(/<[^>]+>/g, '').trim().toLowerCase();
    if (keywords.some(k => text.includes(k)) && text.length > 5 && text.length < 100) {
      let url = match[1];
      if (!url.startsWith('http')) url = `https://${siteUrl}${url.startsWith('/') ? '' : '/'}${url}`;
      products.push({ title: match[2].replace(/<[^>]+>/g, '').trim(), url, site: siteName, price: '' });
    }
  }
  return [...new Map(products.map(p => [p.title, p])).values()].slice(0, 10);
}

export default async () => {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
  await sendTelegram('🔍 Monitor avviato - cerco prodotti MTG...');

  const store = getStore('sl-monitor');
  let knownKeys = [];
  try { const s = await store.get('known-keys'); if (s) knownKeys = JSON.parse(s); } catch(e) {}

  let allProducts = [];

  try {
    const sl = await scrapeSecretLair();
    allProducts = [...allProducts, ...sl];
  } catch(err) {
    await sendTelegram(`❌ Errore Secret Lair: ${err.message}`);
  }

  try {
    const gi = await scrapeGeneric('gameisland.eu', 'Game Island');
    allProducts = [...allProducts, ...gi];
  } catch(err) {
    await sendTelegram(`❌ Errore Game Island: ${err.message}`);
  }

  try {
    const mt = await scrapeGeneric('manatrust.com', 'Mana Trust');
    allProducts = [...allProducts, ...mt];
  } catch(err) {
    await sendTelegram(`❌ Errore Mana Trust: ${err.message}`);
  }

  const newProducts = allProducts.filter(p => !knownKeys.includes(`${p.site}:${p.title}`));
  await sendTelegram(`✅ Trovati ${allProducts.length} prodotti, ${newProducts.length} nuovi`);

  for (const p of newProducts) {
    await sendTelegram(`🃏 NUOVO su ${p.site}!\n\n✦ ${p.title}\n🛒 ${p.url}`);
    await new Promise(r => setTimeout(r, 1000));
  }

  const allKeys = [...new Set([...knownKeys, ...allProducts.map(p => `${p.site}:${p.title}`)])];
  await store.set('known-keys', JSON.stringify(allKeys));
};

export const config = { schedule: "*/30 * * * *" };
