# Botão "Atualizar" ao vivo (Cloudflare Pages) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao dashboard de marketing um botão "Atualizar" que puxa dados ao vivo (leads da planilha + Meta Ads dos últimos 2 meses), sobrepondo o histórico do snapshot diário, hospedado em Cloudflare Pages.

**Architecture:** O site migra de GitHub Pages para **Cloudflare Pages** (mesmo padrão do repo `eventos-vesti`). Uma **Pages Function** (`/api/dados`) roda no servidor da Cloudflare: lê a planilha `LeadsV2` sempre ao vivo, busca na Meta Ads **apenas o mês corrente + o anterior** (janela de atribuição de 28 dias), e faz *merge* dessas séries recentes por cima do `data/data.json` já publicado (o snapshot diário gerado pela GitHub Action, que continua existindo como "base" com todo o histórico). Um cache de borda (~10 min) protege a Meta contra cliques repetidos; `?fresh=1` fura o cache. Se a Meta falhar, cai no snapshot base; se a planilha falhar, o front usa o `data/data.json` estático.

**Tech Stack:** Cloudflare Pages Functions (runtime Workers, JS Web-standard: `fetch`, `crypto.subtle`, `caches.default`), React 18 UMD + Babel standalone in-browser (sem build step), Node 20 `node --test` para os testes de lógica pura, `wrangler` para dev/smoke local.

## Global Constraints

- **Não publicar segredos:** `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `GCP_SA_KEY` (JSON da service account), `SHEET_ID` vão **só** nos secrets da Cloudflare (Production) e no `.dev.vars` local (git-ignored). Nunca no repo, nunca no cliente.
- **Paridade de formato:** a resposta de `/api/dados` deve ter **exatamente** o mesmo shape do `docs/data/data.json` atual (mesmas chaves de topo e a mesma estrutura de `midia_paga`), para o `app.jsx` consumir sem mudar a normalização.
- **Fonte de verdade dos valores:** `SHEET_ID` default `1zNRw8zfoASVlO2EhR56sldTCy4IXRCLKfauU1ROChCE`, aba `LeadsV2`, range `A:K`. Meta API `v21.0`. Perfis SQL = `Pro`, `Starter`, `Qualificado (Sem Faixa)`.
- **Janela recente ao vivo:** mês corrente + mês anterior (decisão do produto). Historial vem do snapshot.
- **Cache de borda:** TTL 600s (10 min) para GET normal; `?fresh=1` ignora o cache mas **ainda** só busca a janela recente na Meta.
- **Sem estado global mutável nas Functions:** o isolate do Workers é reutilizado entre requisições; nenhum helper pode acumular estado entre chamadas (ex.: `UNMAPPED_ETAPAS` deve ser request-local).
- **O plano vive em `plans/` (raiz), nunca em `docs/`** — `docs/` é a raiz publicada do site.

---

## File Structure

**Novos arquivos no repo `marketing`:**

- `wrangler.toml` — config da Cloudflare Pages (nome do projeto, output dir = `docs`).
- `functions/api/dados.js` — **rota** `GET /api/dados`. Orquestra: planilha (ao vivo) + Meta (janela) + merge no snapshot base + cache. Único arquivo com `onRequestGet`.
- `functions/api/_sheets.js` — auth Google via JWT RS256 (WebCrypto) + leitura de valores de aba. **Portado quase verbatim** de `eventos-vesti/functions/api/_shared.js`.
- `functions/api/_meta.js` — fetchers da Meta Ads (`fetchMetaAdsMetadata`, `fetchMetaInsightsDaily`, `fetchMetaReachMonthly`), `monthWindows`, `withRetry`. **Portados de `scripts/extract.js`** (já usam `fetch` global).
- `functions/api/_build.js` — helpers puros (`normalize`, `canonicalPerfil`, `canonicalEtapa`, constantes) + `buildDataFromRows(rows, meta)` (agregação de leads → objeto data.json **sem** as séries Meta) + `recentWindow(todayIso, monthsBack)` + `mergeMetaFields(baseMidia, liveMeta)`. **Lógica pura, testável em Node.**
- `functions/api/_cache.js` — `withCache(context, maxAge, compute)`. **Portado de `eventos-vesti/functions/api/_shared.js`**.
- `test/build.test.mjs` — testes `node --test` da lógica pura de `_build.js`.
- `.dev.vars.example` — modelo dos secrets para dev local (o `.dev.vars` real é git-ignored).
- `DEPLOY-CLOUDFLARE.md` — passo a passo do deploy (secrets, conectar repo, custom domain), espelhando o do `eventos-vesti`.

**Modificados:**

- `docs/js/app.jsx` — refatorar o carregamento de dados num `loadData(fresh)` reutilizável; adicionar o botão "Atualizar" + status no header.
- `docs/index.html` — bump do `?v=` no `<script src="js/app.jsx?v=...">` (cache-busting) e, se necessário, estilos do botão.
- `.gitignore` — adicionar `.dev.vars`.
- `.github/workflows/daily-update.yml` — remover os passos de deploy do GitHub Pages (Setup Pages / Upload artifact / Deploy) mantendo só a geração+commit do `data.json`; a Cloudflare passa a reconstruir no push.
- `README.md` — nota sobre a nova arquitetura (Cloudflare + botão).

**Nota Cloudflare Pages Functions:** arquivos sob `functions/` viram rotas só se exportarem `onRequest*`. Os módulos `_*.js` exportam apenas helpers (sem `onRequest*`), então não viram rota — mesmo padrão já em produção no `eventos-vesti`.

---

### Task 1: Lógica pura de janela e merge (`_build.js`) — TDD

O coração novo do recurso: calcular a janela recente e sobrepor as séries da Meta. É a única lógica genuinamente nova, então vai testada primeiro.

**Files:**
- Create: `functions/api/_build.js`
- Test: `test/build.test.mjs`

**Interfaces:**
- Consumes: nada (funções puras).
- Produces:
  - `recentWindow(todayIso: string, monthsBack = 1): { since: string, until: string }` — `until` = `todayIso`; `since` = 1º dia do mês `monthsBack` meses antes do mês de `todayIso`. Datas em `YYYY-MM-DD`.
  - `META_FIELDS: string[]` = `['spend_daily','impressions_daily','reach_daily','new_msg_contacts_daily','spend_window','reach_monthly','thumbnails','ad_campaign','ad_adset','campaigns']`.
  - `mergeMetaFields(baseMidia: object|null, liveMeta: object): object` — retorna um objeto contendo só os `META_FIELDS`, sobrepondo `liveMeta` sobre `baseMidia`. Para os mapas de série (`spend_daily`, `impressions_daily`, `reach_daily`, `new_msg_contacts_daily`: `{[ad]:{[dia]:num}}`, e `reach_monthly`: `{[ad]:{[ym]:num}}`) faz overlay por ad/chave (live vence, base preenche o resto). Para `thumbnails`/`ad_campaign`/`ad_adset` (mapas rasos `{[ad]:val}`) faz `{...base, ...live}`. Para `campaigns` (array) usa `live` se não-vazio, senão `base`. Para `spend_window` (objeto `{since,until}`) mantém `base` se existir (cobertura total do histórico), senão `live`.

- [ ] **Step 1: Escrever os testes que falham**

```javascript
// test/build.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recentWindow, mergeMetaFields, META_FIELDS } from '../functions/api/_build.js';

test('recentWindow: mês corrente + anterior', () => {
  // 12/08/2026 → since = 1º de julho/2026, until = hoje
  assert.deepEqual(recentWindow('2026-08-12', 1), { since: '2026-07-01', until: '2026-08-12' });
});

test('recentWindow: vira o ano ao voltar de janeiro', () => {
  assert.deepEqual(recentWindow('2026-01-05', 1), { since: '2025-12-01', until: '2026-01-05' });
});

test('mergeMetaFields: overlay de série diária (live vence no dia recente, base mantém o antigo)', () => {
  const base = {
    spend_daily: { AnuncioA: { '2026-06-01': 10, '2026-07-15': 20 } },
    spend_window: { since: '2026-01-01', until: '2026-08-11' },
    campaigns: [{ name: 'C1' }],
  };
  const live = {
    spend_daily: { AnuncioA: { '2026-07-15': 25, '2026-08-12': 5 }, AnuncioNovo: { '2026-08-12': 3 } },
    campaigns: [],
  };
  const out = mergeMetaFields(base, live);
  // dia antigo preservado, dia recente sobrescrito, dia novo adicionado, ad novo adicionado
  assert.deepEqual(out.spend_daily.AnuncioA, { '2026-06-01': 10, '2026-07-15': 25, '2026-08-12': 5 });
  assert.deepEqual(out.spend_daily.AnuncioNovo, { '2026-08-12': 3 });
  // spend_window mantém a cobertura da base
  assert.deepEqual(out.spend_window, { since: '2026-01-01', until: '2026-08-11' });
  // campaigns: live vazio → mantém base
  assert.deepEqual(out.campaigns, [{ name: 'C1' }]);
  // só devolve chaves de META_FIELDS
  assert.ok(Object.keys(out).every(k => META_FIELDS.includes(k)));
});

test('mergeMetaFields: sem base (snapshot indisponível) devolve o live', () => {
  const live = { spend_daily: { A: { '2026-08-12': 1 } }, thumbnails: { A: 'u' } };
  const out = mergeMetaFields(null, live);
  assert.deepEqual(out.spend_daily, { A: { '2026-08-12': 1 } });
  assert.deepEqual(out.thumbnails, { A: 'u' });
});
```

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `node --test test/build.test.mjs`
Expected: FAIL — `Cannot find module '../functions/api/_build.js'` (ou export inexistente).

- [ ] **Step 3: Implementar o mínimo em `_build.js`**

Criar `functions/api/_build.js` com (por enquanto só o necessário para os testes; o resto vem na Task 2):

```javascript
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
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `node --test test/build.test.mjs`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add functions/api/_build.js test/build.test.mjs
git commit -m "feat(api): janela recente e merge das séries da Meta (lógica pura + testes)"
```

---

### Task 2: Agregação de leads pura (`buildDataFromRows`) — TDD

Porta a lógica do loop principal do `extract.js` para uma função pura que transforma as linhas da planilha no objeto `data.json` — **menos** as séries da Meta (que entram via merge na Task 5).

**Files:**
- Modify: `functions/api/_build.js`
- Modify: `test/build.test.mjs`
- Reference (portar de): `scripts/extract.js:13-108` (helpers/constantes) e `scripts/extract.js:346-577` (loop de agregação e shape do output).

**Interfaces:**
- Consumes: nada (puro). Recebe `rows` (matriz de strings, com header na linha 0, como `sheets.spreadsheets.values.get` devolve).
- Produces: `buildDataFromRows(rows: string[][], meta: { sheetId: string, tab: string, generatedAt: string }): object` — devolve o objeto com **todas** as chaves de topo do `data.json` atual (`generated_at`, `sheet_id`, `sheet_tab`, `total_leads`, `total_sql`, `sql_pct`, `perfis`, `origens`, `perfil_counts`, `origem_counts`, `sql_by_origem`, `sql_perfis`, `etapas`, `leads`) e `midia_paga` **apenas com o bloco `chanel`** (as séries da Meta são anexadas depois). `generated_at` = `meta.generatedAt`.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar em `test/build.test.mjs`:

```javascript
import { buildDataFromRows } from '../functions/api/_build.js';

test('buildDataFromRows: conta leads, SQL e reclassifica mídia paga', () => {
  const rows = [
    ['DATA', 'ORIGEM', 'PERFIL', 'ETAPA', 'ANUNCIO', 'NOME CRIATIVO', 'FORMULÁRIO', '', '', '', 'Datetime Etapa'],
    ['01/08/2026', 'Orgânico', 'Pro', 'Etapa 1 - inicial', '', '', 'Sim', '', '', '', ''],
    ['02/08/2026', 'Indicação', 'Starter', 'Etapa 2 - Identificado', 'Ad X', 'Criativo Y', '', '', '', '', ''],
    ['03/08/2026', 'Orgânico', 'Desqualificado', 'Etapa perdido', '', '', '', '', '', '', ''],
  ];
  const out = buildDataFromRows(rows, { sheetId: 'S', tab: 'LeadsV2', generatedAt: '2026-08-12T00:00:00.000Z' });
  assert.equal(out.total_leads, 3);
  assert.equal(out.total_sql, 2); // Pro + Starter são SQL; Desqualificado não
  assert.equal(out.sheet_id, 'S');
  assert.equal(out.generated_at, '2026-08-12T00:00:00.000Z');
  // lead 2 tem ANUNCIO/CRIATIVO → origem reclassificada para "Mídia paga"
  const pago = out.leads.find(l => l.perfil === 'Starter');
  assert.equal(pago.origem, 'Mídia paga');
  // bloco chanel presente e contando o lead de mídia paga
  assert.equal(out.midia_paga.chanel.total, 1);
  // sem séries da Meta ainda
  assert.equal(out.midia_paga.spend_daily, undefined);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/build.test.mjs`
Expected: FAIL — `buildDataFromRows is not a function`.

- [ ] **Step 3: Implementar `buildDataFromRows`**

Em `functions/api/_build.js`, **portar verbatim** de `scripts/extract.js`:
1. Constantes `KNOWN_PERFIS`, `SQL_PERFIS`, `FUNNEL_ETAPAS`, `OUT_OF_FUNNEL_ETAPAS`, `ETAPA_ALIASES` (linhas 13–108).
2. Helpers `normalize`, `canonicalPerfil`, `canonicalEtapa` (mesmas linhas). **Mudança obrigatória:** `canonicalEtapa` não pode mutar um `Set` de módulo (`UNMAPPED_ETAPAS`) — remover essa dependência de estado global (dropar a coleta de não-mapeados; ela só servia para um warning de log no script Node).
3. Envolver o corpo do `main()` (linhas 346–577, **exceto** a leitura da planilha via `googleapis` e o bloco Meta 481–551 e o `fs.writeFileSync`) numa função `buildDataFromRows(rows, meta)`:
   - Usar `rows` recebido no lugar de `resp.data.values`.
   - Substituir `SHEET_ID`/`TAB` por `meta.sheetId`/`meta.tab`.
   - Substituir `generated_at: new Date().toISOString()` por `meta.generatedAt`.
   - `midia_paga` fica **só** com `{ chanel: {...} }` (o objeto montado nas linhas 451–463). Não incluir os campos Meta.
   - `return out;` em vez de escrever em disco.

Exportar `buildDataFromRows`, `normalize`, `canonicalPerfil`, `canonicalEtapa`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/build.test.mjs`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add functions/api/_build.js test/build.test.mjs
git commit -m "feat(api): buildDataFromRows — agregação de leads pura portada do extract.js"
```

---

### Task 3: Adaptador Google Sheets (`_sheets.js`)

Auth por service account (JWT RS256 via WebCrypto) e leitura de valores de aba, para rodar no runtime da Cloudflare (a lib `googleapis` do `extract.js` **não** roda em Workers).

**Files:**
- Create: `functions/api/_sheets.js`
- Reference (portar de): `eventos-vesti/functions/api/_shared.js` — funções `b64urlFromBytes`, `b64urlFromString`, `pemToArrayBuffer`, `parseServiceAccount`, `getGoogleToken`, `sheetTitles`, `sheetValues`.

**Interfaces:**
- Consumes: `env.GCP_SA_KEY` (JSON puro **ou** base64 da service account), `env.SHEET_ID`, `env.SHEET_TAB`.
- Produces:
  - `getGoogleToken(saJson: string): Promise<string>` — access token (scope `spreadsheets.readonly`).
  - `readSheetRows(env, { tab, range }): Promise<string[][]>` — lê `tab!range` e devolve `values` (matriz de strings), no mesmo formato que a Task 2 espera.

- [ ] **Step 1: Portar os helpers do `_shared.js` do eventos**

Copiar de `eventos-vesti/functions/api/_shared.js` para `functions/api/_sheets.js` as funções: `b64urlFromBytes`, `b64urlFromString`, `pemToArrayBuffer`, `parseServiceAccount`, `getGoogleToken`, `sheetTitles`, `sheetValues`. São Web-standard (WebCrypto + `fetch`) e não precisam de alteração.

- [ ] **Step 2: Adicionar `readSheetRows`**

No fim de `_sheets.js`:

```javascript
// Lê uma aba específica e devolve as linhas (matriz de strings), como o extract.js espera.
export async function readSheetRows(env, { tab, range }) {
  if (!env.GCP_SA_KEY) throw new Error('GCP_SA_KEY não configurado.');
  if (!env.SHEET_ID) throw new Error('SHEET_ID não configurado.');
  const token = await getGoogleToken(env.GCP_SA_KEY);
  const rows = await sheetValues(token, env.SHEET_ID, `${tab}!${range}`);
  return rows.map((r) => r.map((c) => String(c == null ? '' : c)));
}
```

Garantir `export` em `getGoogleToken` e `readSheetRows`.

- [ ] **Step 3: Verificação de sintaxe/estrutura**

Run: `node --check functions/api/_sheets.js`
Expected: sem saída (sintaxe OK). *(Teste funcional real acontece no smoke da Task 7 com credenciais.)*

- [ ] **Step 4: Commit**

```bash
git add functions/api/_sheets.js
git commit -m "feat(api): adaptador Google Sheets (JWT WebCrypto) portado do eventos-vesti"
```

---

### Task 4: Fetchers da Meta (`_meta.js`)

Porta os fetchers da Meta do `extract.js` (já usam `fetch` global — rodam em Workers sem mudança), expostos como módulo.

**Files:**
- Create: `functions/api/_meta.js`
- Reference (portar de): `scripts/extract.js` — `fetchMetaAdsMetadata` (125-168), `fetchMetaInsightsDaily` (171-223), `monthWindows` (227-243), `fetchMetaReachMonthly` (247-275), `withRetry` (306-320), `sleep` (296).

**Interfaces:**
- Consumes: `creds = { token, acct }` (com `acct` já no formato `act_...`).
- Produces:
  - `fetchMetaWindow(env, { since, until }): Promise<object>` — devolve `{ spend_daily, impressions_daily, reach_daily, new_msg_contacts_daily, spend_window:{since,until}, reach_monthly, thumbnails, ad_campaign, ad_adset, campaigns }` para a janela pedida. Reproduz o que o bloco Meta do `extract.js` monta em `midia_paga` (linhas 498-526), mas parametrizado pela janela.
  - Falhas parciais (reach/metadata) **não** derrubam a função: retornam sem esses campos (o merge preenche pela base).

- [ ] **Step 1: Portar os fetchers**

Copiar para `functions/api/_meta.js`, com `export`: `monthWindows`, `withRetry`, `sleep`, `fetchMetaAdsMetadata`, `fetchMetaInsightsDaily`, `fetchMetaReachMonthly` (verbatim de `extract.js`; usar `META_API_VERSION = 'v21.0'` como const no topo). Todas já usam `fetch`/`URLSearchParams`/`JSON` globais — sem alteração.

- [ ] **Step 2: Adicionar `loadMetaCreds` + `fetchMetaWindow`**

```javascript
const META_API_VERSION = 'v21.0';

function loadMetaCreds(env) {
  let token = env.META_ACCESS_TOKEN;
  let acct = env.META_AD_ACCOUNT_ID;
  if (!token || !acct) return null;
  if (!acct.startsWith('act_')) acct = 'act_' + acct;
  return { token, acct };
}

// Monta os campos Meta do midia_paga para a janela {since, until}. Espelha extract.js:498-526.
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
```

- [ ] **Step 3: Verificação de sintaxe**

Run: `node --check functions/api/_meta.js`
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add functions/api/_meta.js
git commit -m "feat(api): fetchers da Meta Ads (janela recente) portados do extract.js"
```

---

### Task 5: Cache de borda + rota `/api/dados` (`_cache.js`, `dados.js`)

Junta tudo: cache de borda, leitura do snapshot base, e a orquestração planilha+Meta+merge.

**Files:**
- Create: `functions/api/_cache.js`
- Create: `functions/api/dados.js`
- Reference (portar de): `eventos-vesti/functions/api/_shared.js` — `withCache`.

**Interfaces:**
- Consumes: `readSheetRows` (Task 3), `fetchMetaWindow` (Task 4), `buildDataFromRows`/`recentWindow`/`mergeMetaFields`/`META_FIELDS` (Tasks 1-2), `withCache` (este task).
- Produces: rota `onRequestGet` que devolve JSON no shape do `data.json`, com header `Access-Control-Allow-Origin: *` e `Cache-Control: public, max-age=600`.

- [ ] **Step 1: Portar `withCache`**

Copiar `withCache` de `eventos-vesti/functions/api/_shared.js` para `functions/api/_cache.js` (verbatim; usa `caches.default`, respeita `?fresh`, faz fallback de erro com status 502/503). Exportar.

- [ ] **Step 2: Escrever a rota `dados.js`**

```javascript
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
```

- [ ] **Step 3: Verificação de sintaxe de todos os módulos**

Run: `node --check functions/api/dados.js && node --check functions/api/_cache.js`
Expected: sem saída.

- [ ] **Step 4: Rodar a suíte pura de novo (garantir que nada quebrou)**

Run: `node --test test/build.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/api/_cache.js functions/api/dados.js
git commit -m "feat(api): rota /api/dados — planilha + janela Meta + merge no snapshot, com cache de borda"
```

---

### Task 6: Config Cloudflare + secrets locais (`wrangler.toml`, `.dev.vars.example`, `.gitignore`)

**Files:**
- Create: `wrangler.toml`
- Create: `.dev.vars.example`
- Modify: `.gitignore`

- [ ] **Step 1: `wrangler.toml`**

```toml
# Cloudflare Pages (Functions). Site estático em docs/, funções em functions/api/*.
name = "marketing-vesti"
compatibility_date = "2024-11-06"
pages_build_output_dir = "docs"
```

- [ ] **Step 2: `.dev.vars.example`**

```
# Copie para .dev.vars (git-ignored) e preencha para rodar `wrangler pages dev` localmente.
META_ACCESS_TOKEN=
META_AD_ACCOUNT_ID=act_674298545378209
GCP_SA_KEY=
SHEET_ID=1zNRw8zfoASVlO2EhR56sldTCy4IXRCLKfauU1ROChCE
SHEET_TAB=LeadsV2
```

- [ ] **Step 3: `.gitignore`**

Acrescentar linha:

```
.dev.vars
```

- [ ] **Step 4: Commit**

```bash
git add wrangler.toml .dev.vars.example .gitignore
git commit -m "chore(cloudflare): wrangler.toml + modelo de secrets locais"
```

---

### Task 7: Smoke test local com `wrangler`

Validação funcional ponta-a-ponta antes de mexer no front (a parte de rede que os testes puros não cobrem).

**Files:** nenhum (só execução). Requer `.dev.vars` preenchido (não commitado) e `npx wrangler` disponível.

- [ ] **Step 1: Subir o dev server**

Run: `npx wrangler pages dev docs` (em background/terminal separado).
Expected: sobe em `http://localhost:8788`.

- [ ] **Step 2: Bater no endpoint (fresh)**

Run: `curl -s "http://localhost:8788/api/dados?fresh=1" > /tmp/dados.json && node -e "const d=require('/tmp/dados.json'); console.log('leads', d.total_leads, 'sql', d.total_sql, 'ads_spend', Object.keys(d.midia_paga.spend_daily||{}).length, 'window', JSON.stringify(d.midia_paga.spend_window))"`
Expected: imprime `total_leads` > 0, e `spend_daily` com ao menos 1 ad; `spend_window` cobrindo o histórico (vindo do snapshot base) — confirmando o merge.

- [ ] **Step 3: Conferir o merge da janela**

Verificar que há entradas de `spend_daily` tanto em meses antigos (do snapshot) quanto no mês corrente (da janela ao vivo). Se `spend_window` refletir só ~2 meses, a base não foi lida — investigar `fetchBaseSnapshot` (a rota `/data/data.json` precisa existir no `docs/`).

- [ ] **Step 4: Conferir o cache**

Run: `curl -s "http://localhost:8788/api/dados" -o /dev/null -w "%{time_total}\n"` duas vezes.
Expected: a 2ª resposta é sensivelmente mais rápida (veio do cache de borda).

*(Sem step de commit — task de verificação.)*

---

### Task 8: Botão "Atualizar" no front (`app.jsx`, `index.html`)

**Files:**
- Modify: `docs/js/app.jsx:789-824` (refatorar o load) e o header do componente `App`.
- Modify: `docs/index.html:133` (bump `?v=`).

**Interfaces:**
- Consumes: `GET /api/dados?fresh=1` (Task 5).
- Produces: função `loadData(fresh)` reutilizável; estados `refreshing`/`refreshedAt`; botão no header.

- [ ] **Step 1: Refatorar o load em `loadData(fresh)`**

Em `App()`, substituir o `useEffect` de load (linhas 789-824) por uma função reutilizável e estados de refresh. Adicionar junto aos outros `useState`:

```javascript
    const [refreshing, setRefreshing]   = useState(false);
    const [refreshedAt, setRefreshedAt] = useState(null);

    // Detecta se estamos na Cloudflare (tem /api). Fora dela, usa só o snapshot estático.
    const hasLiveApi = /(^|\.)pages\.dev$/.test(location.hostname) || location.hostname === "localhost";

    const applyJson = useCallback((json) => {
      const norm = (v) => (v != null && String(v).trim()) ? String(v).trim() : BLANK;
      const leads = (json.leads || []).map(l => ({
        ...l,
        origem: norm(canonicalOrigem(l.origem)),
        perfil: norm(l.perfil),
        formulario: l.formulario === "Sim" ? "Sim" : "Não",
        _d: parseLeadDate(l.data),
      }));
      const hasBlankOrigem = leads.some(l => l.origem === BLANK);
      const hasBlankPerfil = leads.some(l => l.perfil === BLANK);
      const origens = [...new Set((json.origens || []).map(canonicalOrigem).filter(o => o && String(o).trim()))]
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
      if (hasBlankOrigem) origens.push(BLANK);
      const perfis = [...new Set((json.perfis || []).filter(p => p && String(p).trim()))];
      if (hasBlankPerfil) perfis.push(BLANK);
      const origem_counts = {};
      for (const [k, v] of Object.entries(json.origem_counts || {})) {
        const ck = norm(canonicalOrigem(k)); origem_counts[ck] = (origem_counts[ck] || 0) + v;
      }
      const sql_by_origem = {};
      for (const [k, v] of Object.entries(json.sql_by_origem || {})) {
        const ck = norm(canonicalOrigem(k)); sql_by_origem[ck] = (sql_by_origem[ck] || 0) + v;
      }
      setRaw({ ...json, leads, origens, perfis, origem_counts, sql_by_origem });
    }, []);

    const loadData = useCallback(async (fresh) => {
      // fresh=true e com API → puxa ao vivo; senão o snapshot estático.
      const url = (fresh && hasLiveApi) ? "/api/dados?fresh=1" : "data/data.json";
      if (fresh) setRefreshing(true);
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        applyJson(await r.json());
        if (fresh) setRefreshedAt(new Date());
      } catch (e) {
        if (fresh) {
          // Falhou o ao vivo → mantém o que está na tela (snapshot já carregado).
          setRefreshedAt(null);
        } else {
          setError(e.message || String(e));
        }
      } finally {
        if (fresh) setRefreshing(false);
      }
    }, [applyJson, hasLiveApi]);

    // Load inicial: snapshot estático (rápido, sem custo de API).
    useEffect(() => { loadData(false); }, [loadData]);
```

- [ ] **Step 2: Adicionar o botão no header (só onde a API existe)**

No JSX do header do `App` (perto do título), inserir. **O botão é gated por `hasLiveApi`** — assim a versão servida pelo GitHub Pages (durante a transição) fica idêntica à de hoje, sem botão; só a versão Cloudflare (`pages.dev`) e o dev local mostram o botão:

```jsx
        {hasLiveApi && (
        <div className="refresh-wrap">
          {refreshedAt && (
            <span className="refresh-status">
              ✓ Atualizado às {refreshedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            className={"btn-refresh" + (refreshing ? " loading" : "")}
            onClick={() => loadData(true)}
            disabled={refreshing}
            title="Puxar leads da planilha e Meta Ads (mês corrente + anterior) agora"
          >
            <span className="ic">⟳</span> {refreshing ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
        )}
```

- [ ] **Step 3: Estilos do botão**

Adicionar ao CSS (em `docs/index.html` no `<style>`, ou no CSS que o header usa) — adaptado do `eventos-vesti`:

```css
.refresh-wrap { display: inline-flex; align-items: center; gap: 10px; }
.refresh-status { font-size: 11.5px; color: #8a8a8a; white-space: nowrap; }
.btn-refresh { display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
  border: 0; border-radius: 8px; padding: 8px 14px; color: #fff; background: #7a1f3d; font-weight: 600; }
.btn-refresh:hover { background: #601731; }
.btn-refresh:disabled { opacity: .6; cursor: default; }
.btn-refresh.loading .ic { animation: spin .9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
```

- [ ] **Step 4: Cache-bust do script**

Em `docs/index.html:133`, trocar o `?v=` para a data de hoje, ex.:

```html
  <script type="text/babel" data-presets="react" src="js/app.jsx?v=2026-08-12-atualizar"></script>
```

- [ ] **Step 5: Verificar no navegador (com o `wrangler pages dev` da Task 7 no ar)**

Abrir `http://localhost:8788`, confirmar: (a) a página carrega com o snapshot; (b) clicar **Atualizar** mostra o spinner, e ao terminar aparece "✓ Atualizado às HH:MM" e os números refletem os dados ao vivo; (c) sem erro no console.

- [ ] **Step 6: Commit**

```bash
git add docs/js/app.jsx docs/index.html
git commit -m "feat(front): botão Atualizar (dados ao vivo via /api/dados)"
```

---

### Task 9: Transição — GitHub Pages e Cloudflare no ar em paralelo

**Decisão:** durante a transição os dois ambientes ficam no ar. A GitHub Action **continua** gerando/commitando o `data.json` **e** publicando no GitHub Pages (sem alteração de comportamento); a Cloudflare reconstrói do mesmo push, de forma independente. O `data/data.json` commitado serve às duas: é o site do Pages e a "base" do merge na Function da Cloudflare. Desligar o GitHub Pages é um passo **manual e opcional**, feito só depois de validar a Cloudflare (documentado na Task 10).

**Files:**
- Modify: `.github/workflows/daily-update.yml` (apenas um comentário de nota; **não** remover os steps de Pages)

- [ ] **Step 1: Adicionar nota de transição no workflow**

No topo de `.github/workflows/daily-update.yml` (logo abaixo do `name:`), adicionar um comentário deixando o estado explícito — **sem** remover nenhum step de deploy do Pages:

```yaml
# NOTA (transição Cloudflare): este workflow continua publicando no GitHub Pages.
# Em paralelo, a Cloudflare Pages reconstrói do mesmo push (deploy independente).
# O commit de docs/data/data.json serve aos dois: site do Pages + base do merge da Function.
# Desligar o GitHub Pages é passo manual/opcional pós-validação (ver DEPLOY-CLOUDFLARE.md).
```

- [ ] **Step 2: Verificar que os steps de Pages seguem intactos**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/daily-update.yml','utf8'); if(!/deploy-pages/.test(y)) throw new Error('deploy-pages sumiu — durante a transição ele deve ficar'); console.log('ok, GitHub Pages mantido')"`
Expected: `ok, GitHub Pages mantido`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/daily-update.yml
git commit -m "ci: nota de transição (GitHub Pages + Cloudflare em paralelo)"
```

---

### Task 10: Docs de deploy (`DEPLOY-CLOUDFLARE.md`, `README.md`)

**Files:**
- Create: `DEPLOY-CLOUDFLARE.md`
- Modify: `README.md`

- [ ] **Step 1: `DEPLOY-CLOUDFLARE.md`**

Escrever o passo a passo (espelhando o do `eventos-vesti`, adaptado):
1. Conectar `vesti-mobi/marketing` na Cloudflare Pages (Workers & Pages → Create → Pages → Connect to Git).
2. Build: Framework preset `None`, build command vazio, **output directory `docs`**, production branch `main`.
3. Secrets (Settings → Environment variables → Production, **Encrypt**): `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` (`act_674298545378209`), `GCP_SA_KEY` (JSON completo da service account, ou base64), `SHEET_ID`, `SHEET_TAB`=`LeadsV2`.
4. Deploy → testar `/api/dados?fresh=1`.
5. (Opcional) Custom domain (ex.: `marketing.vesti.mobi`).
6. (Opcional) Desligar o GitHub Pages em Settings → Pages.

- [ ] **Step 2: Nota no `README.md`**

Adicionar seção curta: arquitetura nova (Cloudflare Pages + Function `/api/dados`, snapshot diário como base, botão Atualizar), apontando para `DEPLOY-CLOUDFLARE.md`.

- [ ] **Step 3: Commit**

```bash
git add DEPLOY-CLOUDFLARE.md README.md
git commit -m "docs: guia de deploy na Cloudflare + nota de arquitetura"
```

---

## Notas de verificação final (rodar antes de considerar pronto)

- `node --test test/build.test.mjs` → todos os testes passam.
- `node --check` em cada `functions/api/*.js` → sem erros de sintaxe.
- Smoke `wrangler pages dev docs` + `/api/dados?fresh=1` → `total_leads` > 0, `spend_daily` com meses antigos (base) **e** recentes (janela), 2ª requisição mais rápida (cache).
- Front local → botão Atualizar funciona, mostra hora, sem erro no console.
- **Deploy real** (feito por você no painel Cloudflare, com os secrets) — o passo a passo em `DEPLOY-CLOUDFLARE.md`. Só depois desligar o GitHub Pages.

## Riscos / decisões já tomadas

- **Janela = mês corrente + anterior** (cobre atribuição de 28 dias). Parametrizável via `recentWindow(today, monthsBack)` se um dia precisar mudar.
- **Endpoint `/api/dados` é público** (igual ao do eventos). Segredos ficam na Cloudflare, nunca no cliente. Se quiser, dá pra somar um check leve de origem depois.
- **Load inicial usa o snapshot estático** (rápido, zero API); o ao vivo é opt-in pelo botão. Isso mantém a página leve e o custo da Meta sob controle.
