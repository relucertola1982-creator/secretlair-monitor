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
      products.push({ title: match[2].replace(/<[^>]+>/g, '').trim(), url, site: 'Mana Trust', price: '' });
    }
  }
  return [...new Map(products.map(p => [p.title, p])).values()].slice(0, 10);
}

async function scrapeManaShop() {
  const pages = [
    'https://themanashop.ch/en/31-booster-packs',
    'https://themanashop.ch/en/31-booster-packs#/page-2'
  ];
  const products = [];
  for (const pageUrl of pages) {
    const r = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await r.text();
    const regex = /<article[^>]*>[\s\S]*?<a[^>]*href="(https:\/\/themanashop\.ch\/en\/[^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<span[^>]*class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const url = match[1];
      const title = match[2].replace(/<[^>]+>/g, '').trim();
      const price = match[3].replace(/<[^>]+>/g, '').trim();
      if (title && title.length > 5) {
        products.push({ title, url, site: 'The Mana Shop', price });
      }
    }
  }
  return [...new Map(products.map(p => [p.title, p])).values()].slice(0, 15);
}

export default async () => {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;

  const store = getStore('sl-monitor');
  let knownKeys = [];
  try { const s = await store.get('known-keys'); if (s) knownKeys = JSON.parse(s); } catch(e) {}

  const now = new Date();
  const isRiepilogo = now.getUTCHours() === 7;

  let allProducts = [];

  try { allProducts = [...allProducts, ...await scrapeManaTrust()]; } catch(err) {}
  try { allProducts = [...allProducts, ...await scrapeManaShop()]; } catch(err) {}

  const newProducts = allProducts.filter(p => !knownKeys.includes(`
