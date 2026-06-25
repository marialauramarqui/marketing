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

// Ordem oficial do funil de vendas (Etapa 1 → Etapa 6) + etapas fora do funil.
// Usadas para ordenar visualizações e calcular taxa de conversão entre estágios.
const FUNNEL_ETAPAS = [
  'Etapa 1 - inicial',
  'Etapa 2 - Identificado',
  'Etapa 3 - concluído',
  'Etapa 4 - reunião agendada',
  'Etapa 5 - em negociação',
  'Etapa 6 - Ganho',
];
const OUT_OF_FUNNEL_ETAPAS = ['Etapa cliente', 'Etapa desqualificado', 'Etapa perdido'];

// Mapeia tanto os códigos da integração (ETAPA_X_NOME) quanto os labels humanos.
const ETAPA_ALIASES = {
  'etapa_1_inicial': 'Etapa 1 - inicial',
  'etapa 1': 'Etapa 1 - inicial',
  'etapa 1 - inicial': 'Etapa 1 - inicial',
  'etapa_2_identificado': 'Etapa 2 - Identificado',
  'etapa 2': 'Etapa 2 - Identificado',
  'etapa 2 - identificado': 'Etapa 2 - Identificado',
  'etapa_3_concluido': 'Etapa 3 - concluído',
  'etapa_3_concluído': 'Etapa 3 - concluído',
  'etapa 3': 'Etapa 3 - concluído',
  'etapa 3 - concluido': 'Etapa 3 - concluído',
  'etapa 3 - concluído': 'Etapa 3 - concluído',
  'etapa_4_reuniao_agendada': 'Etapa 4 - reunião agendada',
  'etapa_4_reunião_agendada': 'Etapa 4 - reunião agendada',
  'etapa 4': 'Etapa 4 - reunião agendada',
  'etapa 4 - reuniao agendada': 'Etapa 4 - reunião agendada',
  'etapa 4 - reunião agendada': 'Etapa 4 - reunião agendada',
  'etapa_5_em_negociacao': 'Etapa 5 - em negociação',
  'etapa_5_em_negociação': 'Etapa 5 - em negociação',
  'etapa 5': 'Etapa 5 - em negociação',
  'etapa 5 - em negociacao': 'Etapa 5 - em negociação',
  'etapa 5 - em negociação': 'Etapa 5 - em negociação',
  'etapa_6_ganho': 'Etapa 6 - Ganho',
  'etapa 6': 'Etapa 6 - Ganho',
  'etapa 6 - ganho': 'Etapa 6 - Ganho',
  // Out-of-funnel: a integração usa o prefixo "ETAPA_0_" (Cliente vem só como ETAPA_CLIENTE).
  'etapa_cliente': 'Etapa cliente',
  'etapa_0_cliente': 'Etapa cliente',
  'etapa cliente': 'Etapa cliente',
  'etapa_desqualificado': 'Etapa desqualificado',
  'etapa_0_desqualificado': 'Etapa desqualificado',
  'etapa desqualificado': 'Etapa desqualificado',
  'etapa_perdido': 'Etapa perdido',
  'etapa_0_perdido': 'Etapa perdido',
  'etapa perdido': 'Etapa perdido',
};

const UNMAPPED_ETAPAS = new Set();
function canonicalEtapa(raw) {
  const v = normalize(raw);
  if (!v) return '';
  const lower = v.toLowerCase();
  if (ETAPA_ALIASES[lower]) return ETAPA_ALIASES[lower];
  for (const known of [...FUNNEL_ETAPAS, ...OUT_OF_FUNNEL_ETAPAS]) {
    if (known.toLowerCase() === lower) return known;
  }
  UNMAPPED_ETAPAS.add(v);
  return v;
}

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

async function fetchMetaAdsMetadata(creds) {
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

async function fetchMetaInsightsDaily(creds, since, until) {
  // Traz spend + impressions + reach + novos contatos de mensagem por ad por dia.
  // "Novos contatos de mensagem" vem do array actions, action_type =
  // onsite_conversion.messaging_first_reply (bate com a coluna "Novos contatos por mensagem"
  // do Ads Manager — pessoa enviou a 1ª resposta após clicar no anúncio, ou seja, contato novo).
  const MSG_ACTION = 'onsite_conversion.messaging_first_reply';
  const fields = 'ad_name,spend,impressions,reach,actions,date_start';
  const params = new URLSearchParams({
    level: 'ad',
    time_increment: '1',
    time_range: JSON.stringify({ since, until }),
    fields,
    limit: '500',
    access_token: creds.token,
  });
  let url = `https://graph.facebook.com/${META_API_VERSION}/${creds.acct}/insights?${params}`;
  const spend = {};
  const impressions = {};
  const reach = {};
  const newMsgContacts = {};
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
  return { spend, impressions, reach, newMsgContacts };
}

// Reach único por mês (calendário) por ad. Necessário porque somar reach diário super-estima
// o alcance real do período — Meta deduplica usuários. Uma chamada por mês.
async function fetchMetaReachMonthly(creds, since, until) {
  const reachMonthly = {};
  // Lista de meses calendário entre since e until inclusivos.
  const startD = new Date(since + 'T00:00:00Z');
  const endD   = new Date(until + 'T00:00:00Z');
  const months = [];
  let cur = new Date(Date.UTC(startD.getUTCFullYear(), startD.getUTCMonth(), 1));
  while (cur <= endD) {
    const y = cur.getUTCFullYear();
    const m = cur.getUTCMonth(); // 0-11
    const monthStart = new Date(Date.UTC(y, m, 1));
    const monthEnd   = new Date(Date.UTC(y, m + 1, 0));
    const callSince = monthStart < startD ? since : `${y}-${String(m+1).padStart(2,'0')}-01`;
    const callUntil = monthEnd > endD ? until : `${y}-${String(m+1).padStart(2,'0')}-${String(monthEnd.getUTCDate()).padStart(2,'0')}`;
    months.push({ ym: `${y}-${String(m+1).padStart(2,'0')}`, since: callSince, until: callUntil });
    cur = new Date(Date.UTC(y, m + 1, 1));
  }
  for (const { ym, since: s, until: u } of months) {
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Campos do midia_paga que vêm da Meta (tudo menos `chanel`, recalculado da planilha).
const META_FIELDS = [
  'spend_daily', 'impressions_daily', 'reach_daily', 'new_msg_contacts_daily',
  'spend_window', 'reach_monthly', 'thumbnails', 'ad_campaign', 'ad_adset', 'campaigns',
];

// Repete uma chamada assíncrona em caso de erro transitório da Meta
// (ex.: "An unknown error occurred (code 1)", que costuma passar na 2ª tentativa).
async function withRetry(label, fn, attempts = 3, baseDelayMs = 3000) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts) {
        console.warn(`AVISO: ${label} falhou (tentativa ${i}/${attempts}): ${e.message} — repetindo em ${(baseDelayMs * i) / 1000}s`);
        await sleep(baseDelayMs * i);
      }
    }
  }
  throw lastErr;
}

// Lê o midia_paga do data.json anterior (já em disco via checkout no CI) para reaproveitar
// dados da Meta quando a atualização falhar — evita "perder" imagens/gasto numa falha pontual.
function loadPrevMidiaPaga() {
  try {
    if (fs.existsSync(OUT_PATH)) {
      const prev = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
      return (prev && prev.midia_paga) || null;
    }
  } catch (e) { /* ignore */ }
  return null;
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
    etapa: header.indexOf('ETAPA'),
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
  const etapaSet = new Set();
  const etapaCounts = {};
  const etapaByOrigem = {};
  const etapaByPerfil = {};
  const etapaByMonth = {};

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
    const rawOrigem = normalize(r[idx.origem]);
    const perfil = canonicalPerfil(r[idx.perfil]);
    if (!rawOrigem && !perfil) continue;
    const data = normalize(r[idx.data] || '');
    const etapa = idx.etapa >= 0 ? canonicalEtapa(r[idx.etapa]) : '';
    const anuncio = idx.anuncio >= 0 ? normalize(r[idx.anuncio]) : '';
    const criativo = idx.criativo >= 0 ? normalize(r[idx.criativo]) : '';

    // Reclassifica como "Mídia paga" qualquer lead com ANUNCIO ou NOME CRIATIVO preenchido,
    // independente do valor original da coluna ORIGEM. Mantém o rawOrigem só nos leads de mídia paga.
    const origem = (anuncio || criativo) ? 'Mídia paga' : rawOrigem;

    leads.push({ data, origem, perfil, etapa });
    if (origem) origemSet.add(origem);
    if (perfil) perfilSet.add(perfil);
    if (perfil) perfilCounts[perfil] = (perfilCounts[perfil] || 0) + 1;
    if (origem) origemCounts[origem] = (origemCounts[origem] || 0) + 1;
    if (SQL_PERFIS.has(perfil)) {
      sqlByOrigem[origem || '(sem origem)'] = (sqlByOrigem[origem || '(sem origem)'] || 0) + 1;
    }

    if (etapa) {
      etapaSet.add(etapa);
      etapaCounts[etapa] = (etapaCounts[etapa] || 0) + 1;
      const oKey = origem || '(sem origem)';
      if (!etapaByOrigem[oKey]) etapaByOrigem[oKey] = {};
      etapaByOrigem[oKey][etapa] = (etapaByOrigem[oKey][etapa] || 0) + 1;
      const pKey = perfil || '(sem perfil)';
      if (!etapaByPerfil[pKey]) etapaByPerfil[pKey] = {};
      etapaByPerfil[pKey][etapa] = (etapaByPerfil[pKey][etapa] || 0) + 1;
      const m = String(data).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) {
        const mKey = `${m[3]}-${m[2]}`;
        if (!etapaByMonth[mKey]) etapaByMonth[mKey] = {};
        etapaByMonth[mKey][etapa] = (etapaByMonth[mKey][etapa] || 0) + 1;
      }
    }

    if (anuncio || criativo) {
      chanel.total++;
      if (SQL_PERFIS.has(perfil)) chanel.total_sql++;
      if (criativo) bumpAgg(chanel.by_criativo, criativo, perfil);
      else chanel.sem_criativo++;
      if (anuncio) bumpAgg(chanel.by_anuncio, anuncio, perfil);
      else chanel.sem_anuncio++;
      chanel.leads.push({ data, perfil, anuncio, criativo, origem: rawOrigem, etapa });
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

  // Lista ordenada: primeiro o funil (na ordem oficial), depois out-of-funnel, depois quaisquer
  // valores desconhecidos que tenham aparecido na planilha. Só inclui o que de fato existe.
  const etapasOrdered = [
    ...FUNNEL_ETAPAS.filter(e => etapaSet.has(e)),
    ...OUT_OF_FUNNEL_ETAPAS.filter(e => etapaSet.has(e)),
    ...Array.from(etapaSet)
      .filter(e => !FUNNEL_ETAPAS.includes(e) && !OUT_OF_FUNNEL_ETAPAS.includes(e))
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ];

  const prevMidiaPaga = loadPrevMidiaPaga();
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
      console.log(`Buscando insights diários no Meta Ads (${since} → ${until})...`);
      const insights = await withRetry('insights diários da Meta', () => fetchMetaInsightsDaily(metaCreds, since, until));
      midia_paga.spend_daily             = insights.spend;
      midia_paga.impressions_daily       = insights.impressions;
      midia_paga.reach_daily             = insights.reach;
      midia_paga.new_msg_contacts_daily  = insights.newMsgContacts;
      midia_paga.spend_window = { since, until };
      const totalSpend = Object.values(insights.spend).reduce((s, ad) => s + Object.values(ad).reduce((a, b) => a + b, 0), 0);
      const totalImpr  = Object.values(insights.impressions).reduce((s, ad) => s + Object.values(ad).reduce((a, b) => a + b, 0), 0);
      const totalMsg   = Object.values(insights.newMsgContacts).reduce((s, ad) => s + Object.values(ad).reduce((a, b) => a + b, 0), 0);
      console.log(`OK Meta: ${Object.keys(insights.spend).length} ad(s), gasto R$ ${totalSpend.toFixed(2)}, ${totalImpr.toLocaleString('pt-BR')} impressões, ${totalMsg.toLocaleString('pt-BR')} novos contatos de mensagem`);

      try {
        console.log('Buscando alcance único por mês...');
        const reachMonthly = await withRetry('alcance mensal da Meta', () => fetchMetaReachMonthly(metaCreds, since, until));
        midia_paga.reach_monthly = reachMonthly;
        const totalAds = Object.keys(reachMonthly).length;
        console.log(`OK alcance mensal: ${totalAds} ad(s) mapeados`);
      } catch (e) {
        console.warn('AVISO: falha ao buscar alcance mensal (' + e.message + ') — dashboard usará soma diária aproximada.');
      }

      try {
        const { thumbs, adCampaign, adAdset, campaigns } = await withRetry('metadata/imagens dos ads da Meta', () => fetchMetaAdsMetadata(metaCreds));
        midia_paga.thumbnails = thumbs;
        midia_paga.ad_campaign = adCampaign;
        midia_paga.ad_adset = adAdset;
        midia_paga.campaigns = campaigns;
        const ativas = campaigns.filter(c => c.effective_status === 'ACTIVE').length;
        console.log(`OK Meta ads metadata: ${Object.keys(thumbs).length} com imagem, ${Object.keys(adCampaign).length} mapeados a campanhas (${campaigns.length} campanhas; ${ativas} ativa(s)), ${Object.keys(adAdset).length} mapeados a adsets`);
      } catch (e) {
        console.warn('AVISO: falha ao buscar metadata dos ads (' + e.message + ') — seguindo sem imagens/campanhas/adsets.');
      }
    } catch (e) {
      console.warn('AVISO: falha ao buscar Meta Ads (' + e.message + ') — seguindo sem gasto.');
    }
  } else {
    console.warn('AVISO: credenciais Meta nao definidas (META_ACCESS_TOKEN/META_AD_ACCOUNT_ID ou ~/.secrets/meta.json) — pulando.');
  }

  // Reaproveita dados da Meta da execução anterior para os campos que não vieram agora
  // (falha total ou parcial). Assim uma falha transitória da Meta não zera as imagens/gasto
  // do dashboard — os leads continuam atualizando normalmente (vêm da planilha).
  if (prevMidiaPaga) {
    const restored = [];
    for (const f of META_FIELDS) {
      if (midia_paga[f] === undefined && prevMidiaPaga[f] !== undefined) {
        midia_paga[f] = prevMidiaPaga[f];
        restored.push(f);
      }
    }
    if (restored.length) {
      console.warn(`AVISO: reaproveitando dados anteriores da Meta (atualização falhou para): ${restored.join(', ')}`);
    }
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
    etapas: {
      list: etapasOrdered,
      funnel_order: FUNNEL_ETAPAS,
      out_of_funnel: OUT_OF_FUNNEL_ETAPAS,
      counts: etapaCounts,
      by_origem: etapaByOrigem,
      by_perfil: etapaByPerfil,
      by_month: etapaByMonth,
    },
    midia_paga,
    leads,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`OK. ${totalLeads} leads, ${totalSql} SQL (${out.sql_pct}%). Escrito em ${OUT_PATH}`);
  if (UNMAPPED_ETAPAS.size > 0) {
    console.warn(`AVISO: ${UNMAPPED_ETAPAS.size} valor(es) de ETAPA sem mapeamento — adicione em ETAPA_ALIASES:`);
    for (const v of UNMAPPED_ETAPAS) console.warn(`  • "${v}"`);
  }
}

main().catch(e => {
  console.error('Falha na extracao:', e.message);
  if (e.response?.data) console.error(JSON.stringify(e.response.data, null, 2));
  process.exit(1);
});
