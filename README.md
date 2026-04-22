# Marketing Dashboard — Vesti

Dashboard interativo dos leads de marketing, alimentado pela planilha `Monitoramento de leads` (Google Sheets).

**Site:** servido pelo GitHub Pages a partir da pasta `docs/`.
**Atualização:** diária às **06:00 BRT** via GitHub Actions (`.github/workflows/daily-update.yml`).

## Componentes

- Filtros dinâmicos por **Origem** e **Perfil**
- KPIs por perfil (Pro, Starter, Multimarca, Qualificado, Desqualificado, Suporte, Em atendimento, Qualificação_incompleta)
- Destaque **SQL** (Starter + Pro + Qualificado sem faixa) com total e % sobre a base
- Gráfico de barras: Origem × Quantidade de SQLs
- Gráfico de rosca: distribuição geral de perfis

## Estrutura

```
marketing-dashboard/
├── .github/workflows/daily-update.yml   # cron 04:30 BRT + deploy GitHub Pages
├── docs/                                # raiz publicada (GitHub Pages)
│   ├── index.html
│   ├── css/style.css
│   ├── js/
│   │   ├── data-loader.js
│   │   ├── filters.js
│   │   ├── kpis.js
│   │   ├── charts.js
│   │   └── main.js
│   └── data/data.json                   # gerado pelo Action (não editar à mão)
├── scripts/extract.js                   # lê planilha → docs/data/data.json
└── package.json
```

## Rodando localmente

```bash
# 1. Aponte para o JSON da service account local
export GOOGLE_APPLICATION_CREDENTIALS="C:/Users/gusth/.secrets/sheets-sa.json"

# 2. Gere os dados
npm install
npm run extract

# 3. Sirva o dashboard
npm run serve   # abre em http://localhost:8080
```

## CI/CD

O workflow roda diariamente e em pushes na `main`:
1. Restaura a chave da service account a partir do secret `GCP_SA_KEY`
2. Executa `node scripts/extract.js` → atualiza `docs/data/data.json`
3. Comita o arquivo (se mudou) e publica no GitHub Pages

### Secrets obrigatórios

| Nome | Valor |
|---|---|
| `GCP_SA_KEY` | JSON completo da service account (uma linha) |
