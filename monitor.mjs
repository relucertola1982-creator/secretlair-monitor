export function parseDrops(text) {
  const drops = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('##')) {
      if (cur) drops.push(cur);
      cur = { title: t.replace(/^#+\s*/, '').trim(), status: 'unknown', desc: '', price: '', dates: '', url: '' };
    } else if (cur) {
      const low = t.toLowerCase();
      if (low.match(/^-\s*(stato|status):/)) {
        const val = t.split(':').slice(1).join(':').trim().toLowerCase();
        cur.status = val.includes('live') ? 'live'
          : (val.includes('upcoming') || val.includes('arriv') || val.includes('soon')) ? 'upcoming'
          : (val.includes('ended') || val.includes('terminat') || val.includes('sold')) ? 'ended'
          : 'unknown';
      } else if (low.match(/^-\s*(url|link):/)) {
        const u = t.split(':').slice(1).join(':').trim();
        if (u.startsWith('http')) cur.url = u;
      } else if (low.match(/^-\s*(price|prezzo):/)) {
        cur.price = t.split(':').slice(1).join(':').trim();
      } else if (low.match(/^-\s*(date|data|disponib|availab):/)) {
        cur.dates = t.split(':').slice(1).join(':').trim();
      } else if (!cur.desc && t.length > 20 && !t.startsWith('-')) {
        cur.desc = t;
      }
    }
  }
  if (cur) drops.push(cur);
  return drops.filter(d => d.title && d.title.length > 2);
}

export async function checkDropsWithClaude(claudeKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `You monitor Secret Lair MTG drops on secretlair.wizards.com. Return ONLY this format, no other text:
## [Drop Name]
- Status: Live/Upcoming/Ended
- Date: [date range when available for purchase]
- Price: [price USD]
- URL: https://secretlair.wizards.com/[path]
- [One sentence description]

Include: active drops, upcoming announced drops, Mystery Lair, Superdrops. No intro, no conclusion.`,
      messages: [{
        role: 'user',
        content: `Search secretlair.wizards.com for all current Secret Lair MTG drops available now, upcoming, and recently announced. Get direct purchase URLs. Today: ${new Date().toLocaleDateString('en-US')}`
      }]
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  const text = (data.content || []).map(b => b.type === 'text' ? b.text : '').filter(Boolean).join('\n');
  return parseDrops(text);
}

export async function sendWhatsApp(phone, apikey, message) {
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apikey)}`;
  try { await fetch(url); } catch(e) {}
}
