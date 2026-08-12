// functions/api/_meta.js — fetchers da Meta Ads, portados de scripts/extract.js.
// Usa apenas globals Web-standard (fetch, URLSearchParams, JSON, setTimeout).
// Expõe fetchMetaWindow(env, { since, until }) como interface de alto nível.

const META_API_VERSION = 'v21.0';

// Lista de janelas {since, until} por mês calendário entre since e until (inclusivos),
// recortadas nas bordas. Usada pra fatiar chamadas de insights que estouram em ranges longos.
export function monthWindows(since, until) {
  const startD = new Date(since + 'T00:00:00Z');
  const endD   = new Date(until + 'T00:00:00Z');
  const windows = [];
  let cur = new Date(Date.UTC(startD.getUTCFullYear(), startD.getUTCMonth(), 1));
  while (cur <= endD) {
    const y = cur.getUTCFullYear();
    const m = cur.getUTCMonth(); // 0-11
    const monthStart = new Date(Date.UTC(y, m, 1));
    const monthEnd   = new Date(Date.UTC(y, m + 1, 0));
    const callSince = monthStart < startD ? since : `${y}-${String(m+1).padStart(2,'0')}-01`;
    const callUntil = monthEnd > endD ? until : `${y}-${String(m+1).padStart(2,'0')}-${String(monthEnd.getUTCDate()).padStart(2,'0')}`;
    windows.push({ ym: `${y}-${String(m+1).padStart(2,'0')}`, since: callSince, until: callUntil });
    cur = new Date(Date.UTC(y, m + 1, 1));
  }
  return windows;
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Repete uma chamada assíncrona em caso de erro transitório da Meta
// (ex.: "An unknown error occurred (code 1)", que costuma passar na 2ª tentativa).
export async function withRetry(label, fn, attempts = 3, baseDelayMs = 3000) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts) {
        await sleep(baseDelayMs * i);
      }
    }
  }
  throw lastErr;
}

export async function fetchMetaAdsMetadata(creds) {
  // Pede thumbnail em 400x400 via field modifier — sem isso, vem fixo em 64x64.
  // Também traz a campanha pai (id/nome/status) e o adset pai (id/nome) para
  // alimentar o filtro de campanha e o rodapé "Conjunto de anúncio" do card.
  const params = new URLSearchParams({
    fields: 'name,creative.thumbnail_width(400).thumbnail_height(400){thumbnail_url},campaign{id,name,status,effective_status},adset{id,name}',
    // limit baixo de propósito: com a expansão de creative{thumbnail_url} aninhada,
    // páginas grandes (ex.: 500) fazem a Meta recusar com "Please reduce the amount
    // of data you're asking for". A paginação abaixo (paging.next) cobre o resto.
    limit: '50',
    access_token: creds.token,
  });
  let url = `https://graph.facebook.com/${META_API_VERSION}/${creds.acct}/ads?${params}`;
  const thumbs = {};
  const adCampaign = {};
  const adAdset = {};
  const campaignsById = new Map();
  let pages = 0;
  while (url) {
    const r = await fetch(url);
    const j = await r.json();
    if (j.error) throw new Error(`Meta API (ads): ${j.error.message}`);
    for (const ad of (j.data || [])) {
      const t = ad.creative && ad.creative.thumbnail_url;
      if (ad.name && t) thumbs[ad.name] = t;
      if (ad.name && ad.campaign && ad.campaign.name) {
        adCampaign[ad.name] = ad.campaign.name;
        if (!campaignsById.has(ad.campaign.id)) {
          campaignsById.set(ad.campaign.id, {
            name: ad.campaign.name,
            status: ad.campaign.status || null,
            effective_status: ad.campaign.effective_status || null,
          });
        }
      }
      if (ad.name && ad.adset && ad.adset.name) {
        adAdset[ad.name] = ad.adset.name;
      }
    }
    pages++;
    url = j.paging && j.paging.next;
    if (pages > 50) break;
  }
  return { thumbs, adCampaign, adAdset, campaigns: [...campaignsById.values()] };
}

export async function fetchMetaInsightsDaily(creds, since, until) {
  // Traz spend + impressions + reach + novos contatos de mensagem por ad por dia.
  // "Novos contatos de mensagem" vem do array actions, action_type =
  // onsite_conversion.messaging_first_reply (bate com a coluna "Novos contatos por mensagem"
  // do Ads Manager — pessoa enviou a 1ª resposta após clicar no anúncio, ou seja, contato novo).
  const MSG_ACTION = 'onsite_conversion.messaging_first_reply';
  const fields = 'ad_name,spend,impressions,reach,actions,date_start';
  const spend = {};
  const impressions = {};
  const reach = {};
  const newMsgContacts = {};

  // Fatiamos a janela por mês calendário. O campo `actions` com time_increment=1
  // estoura "code 1 / subcode 99" (erro genérico do Meta) em ranges longos (~7 meses);
  // por mês a chamada fica dentro do limite síncrono. As chaves são [ad][dia], então
  // os meses se acumulam sem colisão. Mesmo padrão de fatiamento de fetchMetaReachMonthly.
  for (const { since: s, until: u } of monthWindows(since, until)) {
    const params = new URLSearchParams({
      level: 'ad',
      time_increment: '1',
      time_range: JSON.stringify({ since: s, until: u }),
      fields,
      limit: '500',
      access_token: creds.token,
    });
    let url = `https://graph.facebook.com/${META_API_VERSION}/${creds.acct}/insights?${params}`;
    let pages = 0;
    while (url) {
      const r = await fetch(url);
      const j = await r.json();
      if (j.error) throw new Error(`Meta API: ${j.error.message} (code ${j.error.code})`);
      for (const row of (j.data || [])) {
        const ad = row.ad_name;
        const day = row.date_start;
        if (!ad || !day) continue;
        const action = (row.actions || []).find(a => a.action_type === MSG_ACTION);
        const newContacts = action ? parseInt(action.value, 10) : 0;
        if (!spend[ad])           spend[ad]           = {};
        if (!impressions[ad])     impressions[ad]     = {};
        if (!reach[ad])           reach[ad]           = {};
        if (!newMsgContacts[ad])  newMsgContacts[ad]  = {};
        spend[ad][day]           = +((parseFloat(row.spend) || 0).toFixed(2));
        impressions[ad][day]     = parseInt(row.impressions || 0, 10);
        reach[ad][day]           = parseInt(row.reach || 0, 10);
        newMsgContacts[ad][day]  = newContacts;
      }
      pages++;
      url = j.paging && j.paging.next;
      if (pages > 50) break; // hard guard
    }
  }
  return { spend, impressions, reach, newMsgContacts };
}

// Reach único por mês (calendário) por ad. Necessário porque somar reach diário super-estima
// o alcance real do período — Meta deduplica usuários. Uma chamada por mês.
export async function fetchMetaReachMonthly(creds, since, until) {
  const reachMonthly = {};
  for (const { ym, since: s, until: u } of monthWindows(since, until)) {
    const params = new URLSearchParams({
      level: 'ad',
      time_range: JSON.stringify({ since: s, until: u }),
      fields: 'ad_name,reach',
      limit: '500',
      access_token: creds.token,
    });
    let url = `https://graph.facebook.com/${META_API_VERSION}/${creds.acct}/insights?${params}`;
    let pages = 0;
    while (url) {
      const r = await fetch(url);
      const j = await r.json();
      if (j.error) throw new Error(`Meta API (reach ${ym}): ${j.error.message}`);
      for (const row of (j.data || [])) {
        const ad = row.ad_name;
        if (!ad) continue;
        if (!reachMonthly[ad]) reachMonthly[ad] = {};
        reachMonthly[ad][ym] = parseInt(row.reach || 0, 10);
      }
      pages++;
      url = j.paging && j.paging.next;
      if (pages > 20) break;
    }
  }
  return reachMonthly;
}

// Lê credenciais Meta do env do Workers (nunca de disco ou process.env).
// Retorna null se ausentes; prefixa act_ se necessário.
function loadMetaCreds(env) {
  let token = env.META_ACCESS_TOKEN;
  let acct = env.META_AD_ACCOUNT_ID;
  if (!token || !acct) return null;
  if (!acct.startsWith('act_')) acct = 'act_' + acct;
  return { token, acct };
}

// Monta os campos Meta do midia_paga para a janela {since, until}. Espelha extract.js:498-526.
// Falhas parciais (reach/metadata) não derrubam a função — o caller's merge preenche pela base.
// Lança apenas se creds ausentes ou fetchMetaInsightsDaily falhar.
export async function fetchMetaWindow(env, { since, until }) {
  const creds = loadMetaCreds(env);
  if (!creds) throw new Error('Credenciais Meta ausentes (META_ACCESS_TOKEN/META_AD_ACCOUNT_ID).');
  const out = {};
  const insights = await withRetry('insights diários', () => fetchMetaInsightsDaily(creds, since, until));
  out.spend_daily = insights.spend;
  out.impressions_daily = insights.impressions;
  out.reach_daily = insights.reach;
  out.new_msg_contacts_daily = insights.newMsgContacts;
  out.spend_window = { since, until };
  try {
    out.reach_monthly = await withRetry('alcance mensal', () => fetchMetaReachMonthly(creds, since, until));
  } catch (e) { /* segue sem reach_monthly; base preenche */ }
  try {
    const { thumbs, adCampaign, adAdset, campaigns } = await withRetry('metadata', () => fetchMetaAdsMetadata(creds));
    out.thumbnails = thumbs; out.ad_campaign = adCampaign; out.ad_adset = adAdset; out.campaigns = campaigns;
  } catch (e) { /* segue sem metadata; base preenche */ }
  return out;
}
