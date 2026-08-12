# Task 2 Report: `buildDataFromRows` — Agregação de leads pura

**Branch:** `feat/botao-atualizar-cloudflare`
**Commit:** `c437d7d feat(api): buildDataFromRows — agregação de leads pura portada do extract.js`

---

## What Was Built

Ported the lead-aggregation logic from `scripts/extract.js` into a pure, exported function `buildDataFromRows(rows, meta)` in `functions/api/_build.js`, plus added the Task 2 test to `test/build.test.mjs`.

### Files Changed

- **`functions/api/_build.js`** — added ~245 lines:
  - Constants: `KNOWN_PERFIS`, `SQL_PERFIS`, `FUNNEL_ETAPAS`, `OUT_OF_FUNNEL_ETAPAS`, `ETAPA_ALIASES`, `PERFIL_ALIASES` (verbatim from extract.js lines 13–108)
  - Exported helpers: `normalize`, `canonicalPerfil`, `canonicalEtapa` (pure — no mutable module state)
  - Exported `buildDataFromRows(rows, meta)` — wraps the aggregation body from extract.js lines 346–577, minus the `googleapis` read, minus the Meta block (481–551), minus `fs.writeFileSync`. Uses `meta.sheetId`/`meta.tab`/`meta.generatedAt` instead of module constants. Returns `out` object. `midia_paga` contains only `{ chanel: {...} }`.

- **`test/build.test.mjs`** — added the Task 2 fixture test and updated the import to include `buildDataFromRows`.

---

## TDD Evidence

### RED Phase
Command: `node --test test/build.test.mjs`
Output:
```
SyntaxError: The requested module '../functions/api/_build.js' does not provide an export named 'buildDataFromRows'
✖ tests 1, pass 0, fail 1
```

### GREEN Phase
Command: `node --test test/build.test.mjs`
Output:
```
✔ recentWindow: mês corrente + anterior (2.9668ms)
✔ recentWindow: vira o ano ao voltar de janeiro (1.5553ms)
✔ mergeMetaFields: overlay de série diária (live vence no dia recente, base mantém o antigo) (0.3946ms)
✔ mergeMetaFields: sem base (snapshot indisponível) devolve o live (0.1499ms)
✔ buildDataFromRows: conta leads, SQL e reclassifica mídia paga (27.8376ms)
ℹ tests 5, pass 5, fail 0
```

---

## Mandatory Change Applied

`canonicalEtapa` in `extract.js` mutates a module-level `UNMAPPED_ETAPAS` Set (line 85: `UNMAPPED_ETAPAS.add(v)`). Per the Global Constraint "no mutable module state in Workers isolates", the Set and the mutation were removed. The function is now pure — it just returns the raw (non-canonicalized) value when no alias matches. The warning log that consumed `UNMAPPED_ETAPAS` (extract.js lines 582–585) was Node-only and was excluded.

---

## Self-Review

- All top-level keys present: `generated_at`, `sheet_id`, `sheet_tab`, `total_leads`, `total_sql`, `sql_pct`, `perfis`, `origens`, `perfil_counts`, `origem_counts`, `sql_by_origem`, `sql_perfis`, `etapas`, `midia_paga`, `leads`. ✓
- `midia_paga` shape: only `{ chanel: {...} }` — no Meta fields. ✓
- `chanel` block matches extract.js lines 451–463 exactly (including `sql_pct`, `sem_criativo`, `sem_anuncio`, `pct_sem_criativo`, `criativos`, `anuncios`, `leads`). ✓
- Mídia paga reclassification rule applied: `(anuncio || criativo) ? 'Mídia paga' : rawOrigem`. ✓
- Task 1 tests (4) all still pass alongside Task 2 test (1). ✓
- `meta.generatedAt` used instead of `new Date().toISOString()`. ✓

---

## Concerns

None. Implementation is a faithful, minimal port with the one required purity fix.

---

## Fix (Task 2 — cobertura)

**What was added:** Four extra assertions were appended to the existing `buildDataFromRows` test in `test/build.test.mjs`, using the same three fixture rows already present:

- `out.sql_pct` — asserted `66.67` (2 SQL perfis ÷ 3 total leads, rounded to 2 dp)
- `out.etapas.list` — asserted `['Etapa 1 - inicial', 'Etapa 2 - Identificado', 'Etapa perdido']` (funnel etapas first in FUNNEL_ETAPAS order, then out-of-funnel; only etapas actually present in fixture rows are included)
- `out.etapas.counts` — asserted `{ 'Etapa 1 - inicial': 1, 'Etapa 2 - Identificado': 1, 'Etapa perdido': 1 }` (one lead per etapa)
- `out.perfil_counts` — asserted `{ Pro: 1, Starter: 1, Desqualificado: 1 }` (one lead per perfil)

**Expected values were derived** by running `buildDataFromRows` against the fixture rows in a one-off `node --input-type=module` snippet before writing the assertions, ensuring no values were hard-coded from assumption alone.

**Command run:** `node --test test/build.test.mjs`

**Output:**
```
(node:31128) [MODULE_TYPELESS_PACKAGE_JSON] Warning: ...
✔ recentWindow: mês corrente + anterior (3.6787ms)
✔ recentWindow: vira o ano ao voltar de janeiro (0.2652ms)
✔ mergeMetaFields: overlay de série diária (live vence no dia recente, base mantém o antigo) (0.5453ms)
✔ mergeMetaFields: sem base (snapshot indisponível) devolve o live (0.2284ms)
✔ buildDataFromRows: conta leads, SQL e reclassifica mídia paga (13.2517ms)
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

5/5 passing. Only pre-existing MODULE_TYPELESS_PACKAGE_JSON warning (not caused by this fix).
