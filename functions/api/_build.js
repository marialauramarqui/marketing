// functions/api/_build.js — lógica pura (sem rede, sem APIs do Workers).

// ---------------------------------------------------------------------------
// Constantes e helpers portados de scripts/extract.js (linhas 13–108)
// ---------------------------------------------------------------------------

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
  // Out-of-funnel
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

const PERFIL_ALIASES = {
  'desqualficado': 'Desqualificado',
  'qualificado (sem faixa )': 'Qualificado (Sem Faixa)',
  'qualificado (sem faixa)': 'Qualificado (Sem Faixa)',
};

export function normalize(s) {
  return (s || '').toString().trim().replace(/\s+/g, ' ');
}

export function canonicalPerfil(raw) {
  const v = normalize(raw);
  if (!v) return '';
  const lower = v.toLowerCase();
  if (PERFIL_ALIASES[lower]) return PERFIL_ALIASES[lower];
  for (const known of KNOWN_PERFIS) {
    if (known.toLowerCase() === lower) return known;
  }
  return v;
}

// Pure function — no module-level mutable state (UNMAPPED_ETAPAS removed per global constraint).
export function canonicalEtapa(raw) {
  const v = normalize(raw);
  if (!v) return '';
  const lower = v.toLowerCase();
  if (ETAPA_ALIASES[lower]) return ETAPA_ALIASES[lower];
  for (const known of [...FUNNEL_ETAPAS, ...OUT_OF_FUNNEL_ETAPAS]) {
    if (known.toLowerCase() === lower) return known;
  }
  return v;
}

// ---------------------------------------------------------------------------
// buildDataFromRows — porta o corpo do main() de scripts/extract.js (346–577)
// excluindo: leitura via googleapis, bloco Meta (481–551), fs.writeFileSync.
// ---------------------------------------------------------------------------

export function buildDataFromRows(rows, meta) {
  if (rows.length < 2) throw new Error('Planilha vazia ou sem header.');

  const header = rows[0].map(normalize);
  const idx = {
    data: header.indexOf('DATA'),
    origem: header.indexOf('ORIGEM'),
    perfil: header.indexOf('PERFIL'),
    etapa: header.indexOf('ETAPA'),
    anuncio: header.indexOf('ANUNCIO'),
    criativo: header.indexOf('NOME CRIATIVO'),
    // Coluna "FORMULÁRIO": detecta pela grafia p/ tolerar acento/caixa.
    formulario: header.findIndex(h => /formul/i.test(String(h))),
    // Coluna K = "Datetime Etapa": data do evento da etapa.
    dataEtapa: header.findIndex(h => /datetime.*etapa|data.*etapa/i.test(String(h))),
  };
  if (idx.dataEtapa < 0 && header.length > 10) idx.dataEtapa = 10;
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
    const dataEtapa = idx.dataEtapa >= 0 ? normalize(r[idx.dataEtapa] || '') : '';
    // Coluna FORMULÁRIO: "Sim" se preenchida com algo tipo "sim", senão "Não" (inclui vazio).
    const formulario = idx.formulario >= 0 && /sim/i.test(normalize(r[idx.formulario])) ? 'Sim' : 'Não';

    // Reclassifica como "Mídia paga" qualquer lead com ANUNCIO ou NOME CRIATIVO preenchido.
    const origem = (anuncio || criativo) ? 'Mídia paga' : rawOrigem;

    leads.push({ data, origem, perfil, etapa, data_etapa: dataEtapa, formulario });
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
      const mMatch = String(data).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (mMatch) {
        const mKey = `${mMatch[3]}-${mMatch[2]}`;
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

  // midia_paga: apenas o bloco chanel (extract.js linhas 451–463).
  // Os campos Meta (spend_daily, etc.) são anexados depois via mergeMetaFields (Task 5).
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

  // Lista ordenada: funil → out-of-funnel → desconhecidos. Só inclui o que de fato existe.
  const etapasOrdered = [
    ...FUNNEL_ETAPAS.filter(e => etapaSet.has(e)),
    ...OUT_OF_FUNNEL_ETAPAS.filter(e => etapaSet.has(e)),
    ...Array.from(etapaSet)
      .filter(e => !FUNNEL_ETAPAS.includes(e) && !OUT_OF_FUNNEL_ETAPAS.includes(e))
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ];

  const out = {
    generated_at: meta.generatedAt,
    sheet_id: meta.sheetId,
    sheet_tab: meta.tab,
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

  return out;
}

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
