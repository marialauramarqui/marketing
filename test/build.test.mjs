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
