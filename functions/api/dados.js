// GET /api/dados — leads da planilha (ao vivo) + Meta (mês corrente + anterior),
// sobreposto no snapshot diário publicado (docs/data/data.json).
import { withCache } from './_cache.js';
import { readSheetRows } from './_sheets.js';
import { fetchMetaWindow } from './_meta.js';
import { buildDataFromRows, recentWindow, mergeMetaFields } from './_build.js';

const TAB = 'LeadsV2';
const RANGE = 'A:K';

// Lê o snapshot base já publicado (mesma origem). Nunca lança — devolve null se faltar.
async function fetchBaseSnapshot(request) {
  try {
    const url = new URL('/data/data.json', request.url);
    const r = await fetch(url.toString(), { cf: { cacheTtl: 300 } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function nowIsoDateBRT() {
  const d = new Date(Date.now() - 3 * 3600 * 1000); // aprox. UTC-3
  return d.toISOString().slice(0, 10);
}

async function build(context) {
  const { env, request } = context;
  const tab = env.SHEET_TAB || TAB;

  // 1) Leads sempre ao vivo (1 chamada barata).
  const rows = await readSheetRows(env, { tab, range: RANGE });
  const data = buildDataFromRows(rows, {
    sheetId: env.SHEET_ID,
    tab,
    generatedAt: new Date().toISOString(),
  });

  // 2) Snapshot base (histórico) + janela recente ao vivo da Meta.
  const base = await fetchBaseSnapshot(request);
  const win = recentWindow(nowIsoDateBRT(), 1); // mês corrente + anterior
  let live = {};
  try {
    live = await fetchMetaWindow(env, win);
  } catch (e) {
    // Meta falhou por completo → usa só a base (mesma filosofia do loadPrevMidiaPaga).
    live = {};
  }

  // 3) Merge: chanel (fresco, da planilha) + campos Meta sobrepostos.
  Object.assign(data.midia_paga, mergeMetaFields(base?.midia_paga, live));
  return data;
}

export function onRequestGet(context) {
  return withCache(context, 600, () => build(context)); // cache de borda 10 min
}
