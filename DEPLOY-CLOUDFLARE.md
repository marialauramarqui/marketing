# Publicar na Cloudflare Pages — Marketing Dashboard Vesti

O site é estático + uma **Pages Function** (`functions/api/dados`) que puxa a planilha `LeadsV2`
e a Meta Ads **no servidor da Cloudflare** — as chaves ficam guardadas lá (criptografadas),
**nunca** no navegador nem no git.

> As chaves **não vão** no repositório. Você as cola **uma vez** nos "secrets" da Cloudflare
> (passo 3). O arquivo `.dev.vars` é só pra teste local e está no `.gitignore`.

---

## 1. Conectar o repositório

- Acesse **dash.cloudflare.com** → **Workers & Pages** → **Create application** → aba **Pages**
  → **Connect to Git**.
- Autorize o GitHub e **instale o app da Cloudflare na org `vesti-mobi`**, liberando o repositório
  `marketing`.
- Selecione o repositório **`vesti-mobi/marketing`**.

## 2. Configurar o build

- **Project name:** `marketing-vesti` (vira o endereço `marketing-vesti.pages.dev`).
- **Production branch:** `main`
- **Framework preset:** `None`
- **Build command:** *(deixe vazio)*
- **Build output directory:** `docs`

As Functions em `functions/` são detectadas automaticamente — os módulos `_*.js` são helpers
internos e não viram rota (só `dados.js`, que exporta `onRequestGet`).

## 3. Secrets (variáveis de ambiente)

Em **Settings → Environment variables → Production**, adicione cada uma marcando **Encrypt**:

| Nome | Valor |
|---|---|
| `META_ACCESS_TOKEN` | Token do System User da Meta (sem expiração) |
| `META_AD_ACCOUNT_ID` | `act_674298545378209` |
| `GCP_SA_KEY` | **Todo o conteúdo** do JSON da service account do Google |
| `SHEET_ID` | `1zNRw8zfoASVlO2EhR56sldTCy4IXRCLKfauU1ROChCE` |
| `SHEET_TAB` | `LeadsV2` |

> Se o campo `GCP_SA_KEY` não aceitar quebras de linha, cole a versão em **base64**
> (o código aceita as duas). Para gerar o base64 no Windows (PowerShell, na pasta do projeto):
>
> ```powershell
> [Convert]::ToBase64String([IO.File]::ReadAllBytes("sheets-sa.json"))
> ```
>
> Copie a linha gerada (sem quebras) e cole como valor do secret.

## 4. Deploy

- Clique em **Save and Deploy**. Em aproximadamente 1 minuto o site sobe em
  **https://marketing-vesti.pages.dev**.
- Se já tiver clicado em Deploy antes de adicionar os secrets, adicione-os em Settings e clique
  em **Retry deployment**.

## 5. Testar

1. Abra a URL `https://marketing-vesti.pages.dev`.
2. Confirme que o dashboard carrega com o snapshot diário (`data/data.json`).
3. Clique no botão **Atualizar** — deve puxar os leads da planilha e os dados da Meta Ads ao vivo
   (mês corrente + mês anterior) e exibir "✓ Atualizado às HH:MM".
4. Teste direto o endpoint: `https://marketing-vesti.pages.dev/api/dados?fresh=1`
   - Deve retornar JSON com `total_leads`, `total_sql`, `midia_paga.spend_daily`, etc.
   - O campo `midia_paga.spend_window` reflete o histórico completo do snapshot base (não apenas
     os 2 meses recentes), confirmando que o merge funcionou.
5. Acesse a URL novamente em menos de 10 minutos — a segunda resposta vem do **cache de borda**
   (TTL 600s). Use `?fresh=1` para furar o cache e forçar nova busca à API.

## 6. Atualizações futuras

Qualquer `git push` no repositório → a Cloudflare **reconstrói sozinha**. A GitHub Action diária
continua gerando/commitando `docs/data/data.json` (o snapshot histórico), que o push aciona o
rebuild da Cloudflare também — os dois pipelines coexistem sem conflito.

## 7. (opcional) Domínio próprio

- Pages → **Custom domains** → **Set up a custom domain** → ex.: `marketing.vesti.mobi`.
- Adicione o registro CNAME que a Cloudflare indicar no DNS da `vesti.mobi`.

## 8. (opcional) Desligar o GitHub Pages — transição

Durante a transição, **o GitHub Pages continua no ar em paralelo**. O snapshot estático
(`data/data.json`) alimenta os dois: o site do GitHub Pages e a base do merge na Function da
Cloudflare.

O botão **Atualizar** só aparece na versão Cloudflare (e no dev local); a versão GitHub Pages
segue comportamento idêntico ao atual, sem botão.

Para desligar o GitHub Pages **após** validar a Cloudflare:
- No GitHub: repositório → **Settings → Pages → None** → Save.

## 9. Desenvolvimento local

1. Copie o arquivo de exemplo e preencha com os valores reais (sem aspas):
   ```
   cp .dev.vars.example .dev.vars
   ```
2. Suba o servidor local:
   ```
   npx wrangler pages dev docs
   ```
3. Acesse `http://localhost:8788` e teste `http://localhost:8788/api/dados?fresh=1`.

O arquivo `.dev.vars` está no `.gitignore` — nunca será commitado.
