// test/build.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recentWindow, mergeMetaFields, META_FIELDS, buildDataFromRows } from '../functions/api/_build.js';

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
