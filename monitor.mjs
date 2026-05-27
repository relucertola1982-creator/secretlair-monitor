import { getStore } from "@netlify/blobs";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(msg) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'HTML' })
  });
}

async function scrapeAmazon(domain, keyword) {
  const url = `https://www.amazon.${domain}/s?k=${encodeURIComponent(keyword)}&i=toys`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'it-IT,it;q=0.9',
      'Accept': 'text/html'
    }
  });
  const html = await r.text();
  const products = [];
  const regex = /data-asin="([A-Z0-9]{10})"[\s\S]*?<span class="a-text-normal">([\s\S]*?)<\/span>/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const asin = match[1];
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    if (title && title.length > 10 && asin) {
      products.push({
        title: title.substring(0, 80),
        url: `https://www.amazon.${domain}/dp/${asin}`,
        site: `Amazon.${domain}`
      });
    }
  }
  return [...new Map(products.map(p => [p.title, p])).values()].slice(0, 8);
}

async function scrapeManaTrust() {
  const r = await fetch('https://manatrust.com', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await r.text();
  const products = [];
  const keywords = ['collector booster', 'set booster', 'bundle', 'commander', 'draft booster', 'magic', 'secret lair'];
  const regex = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const text = match[2].replace(/<[^>]+>/g, '').trim().toLowerCase();
    if (keywords.some(k => text.includes(k)) && text.length > 5 && text.length < 100) {
      let url = match[1];
      if (!url.startsWith('http')) url = `https://manatrust.com${url.startsWith('/') ? '' : '/'}${url}`;
      products.push({ title: match[2].replace(/<[^>]+>/g, '').trim(), url, site: 'Mana Trust' });
    }
  }
  return [...new Map(products.map(p => [p.title, p])).values()].slice(0, 10);
}

export default async () => {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;

  const store = getStore('sl-monitor');
  let knownKeys = [];
  try { const s = await store.get('known-keys'); if (s) knownKeys = JSON.parse(s); } catch(e) {}

  const now = new Date();
  const isRiepilogo = now.getUTCHours() === 7;

  let allProducts = [];

  // Mana Trust
  try { allProducts = [...allProducts, ...await scrapeManaTrust()]; } catch(err) {}

  // Amazon .it
  try { allProducts = [...allProducts, ...await scrapeAmazon('it', 'Magic The Gathering Collector Booster')]; } catch(err) {}
  await new Promise(r => setTimeout(r, 3000));

  // Amazon .fr
  try { allProducts = [...allProducts, ...await scrapeAmazon('fr', 'Magic The Gathering Collector Booster')]; } catch(err) {}
  await new Promise(r => setTimeout(r, 3000));

  // Amazon .de
  try { allProducts = [...allProducts, ...await scrapeAmazon('de', 'Magic The Gathering Collector Booster')]; } catch(err) {}

  // Nuovi prodotti → notifica immediata
  const newProducts = allProducts.filter(p => !knownKeys.includes(`${p.site}:${p.title}`));
  for (const p of newProducts) {
    await sendTelegram(`🃏 <b>NUOVO MTG su ${p.site}!</b>\n\n✦ ${p.title}\n🛒 ${p.url}`);
    await new Promise(r => setTimeout(r, 1000));
  }

  // Riepilogo mattutino alle 9
  if (isRiepilogo && allProducts.length > 0) {
    const bySite = {};
    for (const p of allProducts) {
      if (!bySite[p.site]) bySite[p.site] = [];
      bySite[p.site].push(p);
    }
    let msg = `☀️ <b>Buongiorno! Riepilogo MTG del ${now.toLocaleDateString('it-IT')}</b>\n\n`;
    for (const [site, prods] of Object.entries(bySite)) {
      msg += `<b>📦 ${site}</b>\n`;
      for (const p of prods.slice(0, 5)) {
        msg += `• <a href="${p.url}">${p.title}</a>\n`;
      }
      msg += '\n';
    }
    await sendTelegram(msg);
  }

  const allKeys = [...new Set([...knownKeys, ...allProducts.map(p => `${p.site}:${p.title}`)])];
  await store.set('known-keys', JSON.stringify(allKeys));
};

export const config = { schedule: "*/30 * * * *" };
