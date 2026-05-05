#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SHEET_ID = process.env.SHEET_ID || '1zNRw8zfoASVlO2EhR56sldTCy4IXRCLKfauU1ROChCE';
const TAB = process.env.SHEET_TAB || 'LeadsV2';
const RANGE = `${TAB}!A:I`;
const OUT_PATH = path.join(__dirname, '..', 'docs', 'data', 'data.json');

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
  }

  const totalLeads = leads.length;
  const totalSql = Object.values(sqlByOrigem).reduce((a, b) => a + b, 0);

  const perfis = Array.from(new Set([...KNOWN_PERFIS, ...perfilSet])).filter(p => perfilSet.has(p) || perfilCounts[p]);
  const origens = Array.from(origemSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));

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
