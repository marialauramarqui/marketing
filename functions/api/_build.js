// functions/api/_build.js — lógica pura (sem rede, sem APIs do Workers).

export const META_FIELDS = [
  'spend_daily', 'impressions_daily', 'reach_daily', 'new_msg_contacts_daily',
  'spend_window', 'reach_monthly', 'thumbnails', 'ad_campaign', 'ad_adset', 'campaigns',
];

// Janela recente ao vivo: 1º dia do mês (corrente - monthsBack) até hoje.
export function recentWindow(todayIso, monthsBack = 1) {
  const [y, m] = todayIso.split('-').map(Number); // m: 1-12
  const d = new Date(Date.UTC(y, m - 1 - monthsBack, 1));
  const since = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  return { since, until: todayIso };
}

const isSeriesMap = (v) => v && typeof v === 'object' && !Array.isArray(v);

function overlaySeries(base = {}, live = {}) {
  const out = {};
  for (const ad of new Set([...Object.keys(base), ...Object.keys(live)])) {
    out[ad] = { ...(base[ad] || {}), ...(live[ad] || {}) }; // live vence por chave (dia/mês)
  }
  return out;
}

export function mergeMetaFields(baseMidia, liveMeta) {
  const base = baseMidia || {};
  const live = liveMeta || {};
  const out = {};
  const seriesKeys = ['spend_daily', 'impressions_daily', 'reach_daily', 'new_msg_contacts_daily', 'reach_monthly'];
  const shallowKeys = ['thumbnails', 'ad_campaign', 'ad_adset'];

  for (const k of seriesKeys) {
    if (base[k] === undefined && live[k] === undefined) continue;
    out[k] = overlaySeries(isSeriesMap(base[k]) ? base[k] : {}, isSeriesMap(live[k]) ? live[k] : {});
  }
  for (const k of shallowKeys) {
    if (base[k] === undefined && live[k] === undefined) continue;
    out[k] = { ...(base[k] || {}), ...(live[k] || {}) };
  }
  // campaigns: usa live se tiver conteúdo, senão base.
  if (live.campaigns?.length) out.campaigns = live.campaigns;
  else if (base.campaigns) out.campaigns = base.campaigns;
  // spend_window: base cobre todo o histórico; só usa live se não houver base.
  if (base.spend_window) out.spend_window = base.spend_window;
  else if (live.spend_window) out.spend_window = live.spend_window;

  return out;
}
