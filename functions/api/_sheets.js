// Adaptador Google Sheets para o runtime da Cloudflare (Workers).
// Auth via service account com JWT RS256 (WebCrypto) + leitura de valores de aba.
// Portado de eventos-vesti/functions/api/_shared.js (funções Web-standard; sem alteração).

/* ------------------------- helpers de codificação ------------------------- */
function b64urlFromBytes(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlFromString(str) {
  return b64urlFromBytes(new TextEncoder().encode(str));
}
function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// Aceita a conta de serviço como JSON puro ou como base64 (facilita colar o secret na Cloudflare).
function parseServiceAccount(v) {
  if (typeof v !== "string") return v;
  const s = v.trim();
  return JSON.parse(s.startsWith("{") ? s : atob(s));
}

/* ------------------------- autenticação Google (JWT RS256 via WebCrypto) ------------------------- */
export async function getGoogleToken(saJson) {
  const sa = parseServiceAccount(saJson);
  const now = Math.floor(Date.now() / 1000);
  const aud = sa.token_uri || "https://oauth2.googleapis.com/token";
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64urlFromString(JSON.stringify(header))}.${b64urlFromString(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${b64urlFromBytes(new Uint8Array(sig))}`;
  const resp = await fetch(aud, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error("Falha ao autenticar no Google: " + JSON.stringify(data).slice(0, 300));
  return data.access_token;
}

/* ------------------------- leitura de abas (Sheets API v4) ------------------------- */
async function sheetTitles(token, sheetId) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`, {
    headers: { Authorization: "Bearer " + token },
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "erro na API do Google Sheets");
  return (d.sheets || []).map((s) => s.properties.title);
}
async function sheetValues(token, sheetId, title) {
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(title)}`,
    { headers: { Authorization: "Bearer " + token } },
  );
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "erro ao ler a aba");
  return d.values || [];
}

/* ------------------------- interface pública do adaptador ------------------------- */
// Lê uma aba específica e devolve as linhas (matriz de strings), como o extract.js espera.
export async function readSheetRows(env, { tab, range }) {
  if (!env.GCP_SA_KEY) throw new Error('GCP_SA_KEY não configurado.');
  if (!env.SHEET_ID) throw new Error('SHEET_ID não configurado.');
  const token = await getGoogleToken(env.GCP_SA_KEY);
  const rows = await sheetValues(token, env.SHEET_ID, `${tab}!${range}`);
  return rows.map((r) => r.map((c) => String(c == null ? '' : c)));
}
