#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SHEET_ID = process.env.SHEET_ID || '1zNRw8zfoASVlO2EhR56sldTCy4IXRCLKfauU1ROChCE';
const TAB = process.env.SHEET_TAB || 'LeadsV2';
const RANGE = `${TAB}!A:I`;
const OUT_PATH = path.join(__dirname, '..', 'docs', 'data', 'data.json');
const META_API_VERSION = 'v21.0';
const META_LOCAL_CREDS = path.join(process.env.USERPROFILE || process.env.HOME || '', '.secrets', 'meta.json');

const KNOWN_PERFIS = [
  'Pro',
  'Starter',
  'Multimarca',
  'Qualificado (Sem Faixa)',
  'Desqualificado',
  'Suporte',
  'Em atendimento',
  'Qualificação_incompleta',
];

const SQL_PERFIS = new Set(['Pro', 'Starter', 'Qualificado (Sem Faixa)']);

const PERFIL_ALIASES = {
  'desqualficado': 'Desqualificado',
  'qualificado (sem faixa )': 'Qualificado (Sem Faixa)',
  'qualificado (sem faixa)': 'Qualificado (Sem Faixa)',
};

function normalize(s) {
  return (s || '').toString().trim().replace(/\s+/g, ' ');
}

function canonicalPerfil(raw) {
  const v = normalize(raw);
  if (!v) return '';
  const lower = v.toLowerCase();
  if (PERFIL_ALIASES[lower]) return PERFIL_ALIASES[lower];
  for (const known of KNOWN_PERFIS) {
    if (known.toLowerCase() === lower) return known;
  }
  return v;
}

function loadMetaCreds() {
  let token = process.env.META_ACCESS_TOKEN;
  let acct = process.env.META_AD_ACCOUNT_ID;
  if ((!token || !acct) && fs.existsSync(META_LOCAL_CREDS)) {
    try {
      const j = JSON.parse(fs.readFileSync(META_LOCAL_CREDS, 'utf8'));
      token = token || j.access_token;
      acct = acct || j.ad_account_id;
    } catch (e) { /* ignore */ }
  }
  if (!token || !acct) return null;
  if (!acct.startsWith('act_')) acct = 'act_' + acct;
  return { token, acct };
}

async function fetchMetaAdThumbnails(creds) {
  // Pede thumbnail em 400x400 via field modifier — sem isso, vem fixo em 64x64.
  const params = new URLSearchParams({
    fields: 'name,creative.thumbnail_width(400).thumbnail_height(400){thumbnail_url}',
    limit: '500',
    access_token: creds.token,
  });
  let url = `https://graph.facebook.com/${META_API_VERSION}/${creds.acct}/ads?${params}`;
  const thumbs = {};
  let pages = 0;
  while (url) {
    const r = await fetch(url);
    const j = await r.json();
    if (j.error) throw new Error(`Meta API (ads): ${j.error.message}`);
    for (const ad of (j.data || [])) {
      const t = ad.creative && ad.creative.thumbnail_url;
      if (ad.name && t) thumbs[ad.name] = t;
    }
    pages++;
    url = j.paging && j.paging.next;
    if (pages > 50) break;
  }
  return thumbs;
}

async function fetchMetaSpendDaily(creds, since, until) {
  const fields = 'ad_name,spend,date_start';
  const params = new URLSearchParams({
    level: 'ad',
    time_increment: '1',
    time_range: JSON.stringify({ since, until }),
    fields,
    limit: '500',
    access_token: creds.token,
  });
  let url = `https://graph.facebook.com/${META_API_VERSION}/${creds.acct}/insights?${params}`;
  const series = {};
  let pages = 0;
  while (url) {
    const r = await fetch(url);
    const j = await r.json();
    if (j.error) throw new Error(`Meta API: ${j.error.message} (code ${j.error.code})`);
    for (const row of (j.data || [])) {
      const ad = row.ad_name;
      const day = row.date_start;
      const spend = parseFloat(row.spend) || 0;
      if (!ad || !day) continue;
      if (!series[ad]) series[ad] = {};
      series[ad][day] = +(spend.toFixed(2));
    }
    pages++;
    url = j.paging && j.paging.next;
    if (pages > 50) break; // hard guard
  }
  return series;
}

async function getAuth() {
  const inlineJson = process.env.GCP_SA_KEY;
  if (inlineJson) {
    const credentials = JSON.parse(inlineJson);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  }
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyFile) {
    throw new Error('Defina GCP_SA_KEY (JSON) ou GOOGLE_APPLICATION_CREDENTIALS (caminho).');
  }
  return new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

async function main() {
  const auth = await (await getAuth()).getClient();
  const sheets = google.sheets({ version: 'v4', auth });

  console.log(`Lendo ${SHEET_ID} :: ${RANGE} ...`);
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: RANGE,
  });
  const rows = resp.data.values || [];
  if (rows.length < 2) throw new Error('Planilha vazia ou sem header.');

  const header = rows[0].map(normalize);
  const idx = {
    data: header.indexOf('DATA'),
    origem: header.indexOf('ORIGEM'),
    perfil: header.indexOf('PERFIL'),
    anuncio: header.indexOf('ANUNCIO'),
    criativo: header.indexOf('NOME CRIATIVO'),
  };
  if (idx.origem < 0 || idx.perfil < 0) {
    throw new Error(`Header esperado nao encontrado. Header lido: ${JSON.stringify(header)}`);
  }

  const leads = [];
  const perfilCounts = {};
  const origemCounts = {};
  const sqlByOrigem = {};
  const origemSet = new Set();
  const perfilSet = new Set();

  const chanel = {
    total: 0,
    total_sql: 0,
    sem_criativo: 0,
    sem_anuncio: 0,
    by_criativo: new Map(),
    by_anuncio: new Map(),
    leads: [],
  };
  const bumpAgg = (map, key, perfil) => {
    if (!map.has(key)) map.set(key, { name: key, total: 0, sql: 0, by_perfil: {} });
    const e = map.get(key);
    e.total++;
    if (SQL_PERFIS.has(perfil)) e.sql++;
    if (perfil) e.by_perfil[perfil] = (e.by_perfil[perfil] || 0) + 1;
  };

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const origem = normalize(r[idx.origem]);
    const perfil = canonicalPerfil(r[idx.perfil]);
    if (!origem && !perfil) continue;
    const data = normalize(r[idx.data] || '');

    leads.push({ data, origem, perfil });
    if (origem) origemSet.add(origem);
    if (perfil) perfilSet.add(perfil);
    if (perfil) perfilCounts[perfil] = (perfilCounts[perfil] || 0) + 1;
    if (origem) origemCounts[origem] = (origemCounts[origem] || 0) + 1;
    if (SQL_PERFIS.has(perfil)) {
      sqlByOrigem[origem || '(sem origem)'] = (sqlByOrigem[origem || '(sem origem)'] || 0) + 1;
    }

    if (origem === '[SALES] Chanel') {
      chanel.total++;
      if (SQL_PERFIS.has(perfil)) chanel.total_sql++;
      const anuncio = idx.anuncio >= 0 ? normalize(r[idx.anuncio]) : '';
      const criativo = idx.criativo >= 0 ? normalize(r[idx.criativo]) : '';
      if (criativo) bumpAgg(chanel.by_criativo, criativo, perfil);
      else chanel.sem_criativo++;
      if (anuncio) bumpAgg(chanel.by_anuncio, anuncio, perfil);
      else chanel.sem_anuncio++;
      chanel.leads.push({ data, perfil, anuncio, criativo });
    }
  }

  const finalizeList = (map) => [...map.values()]
    .map(e => ({ ...e, sql_pct: e.total ? +(100 * e.sql / e.total).toFixed(2) : 0 }))
    .sort((a, b) => b.total - a.total);
  const midia_paga = {
    chanel: {
      total: chanel.total,
      total_sql: chanel.total_sql,
      sql_pct: chanel.total ? +(100 * chanel.total_sql / chanel.total).toFixed(2) : 0,
      sem_criativo: chanel.sem_criativo,
      sem_anuncio: chanel.sem_anuncio,
      pct_sem_criativo: chanel.total ? +(100 * chanel.sem_criativo / chanel.total).toFixed(2) : 0,
      criativos: finalizeList(chanel.by_criativo),
      anuncios: finalizeList(chanel.by_anuncio),
      leads: chanel.leads,
    },
  };

  const totalLeads = leads.length;
  const totalSql = Object.values(sqlByOrigem).reduce((a, b) => a + b, 0);

  const perfis = Array.from(new Set([...KNOWN_PERFIS, ...perfilSet])).filter(p => perfilSet.has(p) || perfilCounts[p]);
  const origens = Array.from(origemSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const metaCreds = loadMetaCreds();
  if (metaCreds) {
    try {
      // Determina janela: do lead mais antigo (ou 90 dias atrás, o que vier antes) até hoje.
      let earliestIso = null;
      for (const l of leads) {
        const m = String(l.data).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (!m) continue;
        const iso = `${m[3]}-${m[2]}-${m[1]}`;
        if (!earliestIso || iso < earliestIso) earliestIso = iso;
      }
      const today = new Date();
      const fallback = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const since = earliestIso && earliestIso < fallback ? earliestIso : fallback;
      const until = today.toISOString().slice(0, 10);
      console.log(`Buscando gasto diário no Meta Ads (${since} → ${until})...`);
      const spendDaily = await fetchMetaSpendDaily(metaCreds, since, until);
      midia_paga.spend_daily = spendDaily;
      midia_paga.spend_window = { since, until };
      const totalSpend = Object.values(spendDaily).reduce((s, ad) => s + Object.values(ad).reduce((a, b) => a + b, 0), 0);
      console.log(`OK Meta: ${Object.keys(spendDaily).length} ad(s), gasto total no período R$ ${totalSpend.toFixed(2)}`);

      try {
        const thumbs = await fetchMetaAdThumbnails(metaCreds);
        midia_paga.thumbnails = thumbs;
        console.log(`OK Meta thumbnails: ${Object.keys(thumbs).length} criativo(s) com imagem`);
      } catch (e) {
        console.warn('AVISO: falha ao buscar thumbnails (' + e.message + ') — seguindo sem imagens.');
      }
    } catch (e) {
      console.warn('AVISO: falha ao buscar Meta Ads (' + e.message + ') — seguindo sem gasto.');
    }
  } else {
    console.warn('AVISO: credenciais Meta nao definidas (META_ACCESS_TOKEN/META_AD_ACCOUNT_ID ou ~/.secrets/meta.json) — pulando.');
  }

  const out = {
    generated_at: new Date().toISOString(),
    sheet_id: SHEET_ID,
    sheet_tab: TAB,
    total_leads: totalLeads,
    total_sql: totalSql,
    sql_pct: totalLeads > 0 ? +(100 * totalSql / totalLeads).toFixed(2) : 0,
    perfis,
    origens,
    perfil_counts: perfilCounts,
    origem_counts: origemCounts,
    sql_by_origem: sqlByOrigem,
    sql_perfis: Array.from(SQL_PERFIS),
    midia_paga,
    leads,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`OK. ${totalLeads} leads, ${totalSql} SQL (${out.sql_pct}%). Escrito em ${OUT_PATH}`);
}

main().catch(e => {
  console.error('Falha na extracao:', e.message);
  if (e.response?.data) console.error(JSON.stringify(e.response.data, null, 2));
  process.exit(1);
});
