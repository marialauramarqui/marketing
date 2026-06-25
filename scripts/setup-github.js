#!/usr/bin/env node
const fs = require('fs');
const sodium = require('libsodium-wrappers');

const TOKEN = process.env.GH_TOKEN;
const OWNER = process.env.GH_OWNER || 'vesti-mobi';
const REPO = process.env.GH_REPO || 'marketing';
const SA_KEY_PATH = process.env.SA_KEY_PATH || 'C:/Users/gusth/.secrets/sheets-sa.json';

if (!TOKEN) { console.error('GH_TOKEN env required'); process.exit(1); }

const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'marketing-dashboard-setup',
};

async function gh(method, path, body) {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const res = await fetch(url, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.message) || text || res.statusText;
    const err = new Error(`${method} ${path} -> ${res.status}: ${msg}`);
    err.status = res.status; err.body = data;
    throw err;
  }
  return data;
}

async function setSecret(name, value) {
  const pk = await gh('GET', '/actions/secrets/public-key');
  await sodium.ready;
  const messageBytes = Buffer.from(value, 'utf8');
  const keyBytes = Buffer.from(pk.key, 'base64');
  const encryptedBytes = sodium.crypto_box_seal(messageBytes, keyBytes);
  const encrypted_value = Buffer.from(encryptedBytes).toString('base64');
  await gh('PUT', `/actions/secrets/${name}`, {
    encrypted_value,
    key_id: pk.key_id,
  });
  console.log(`  secret '${name}' set`);
}

async function enablePages() {
  try {
    const existing = await gh('GET', '/pages');
    console.log(`  Pages already enabled: ${existing.html_url}`);
    return existing;
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  const created = await gh('POST', '/pages', {
    source: { branch: 'main', path: '/docs' },
  });
  console.log(`  Pages enabled: ${created.html_url || '(URL pending)'}`);
  return created;
}

(async () => {
  console.log(`==> Repo: ${OWNER}/${REPO}`);
  const saJson = fs.readFileSync(SA_KEY_PATH, 'utf8');
  console.log('==> Setting secret GCP_SA_KEY ...');
  await setSecret('GCP_SA_KEY', saJson);
  console.log('==> Enabling GitHub Pages (source: main /docs) ...');
  await enablePages();
  console.log('Done.');
})().catch(e => {
  console.error('FAIL:', e.message);
  if (e.body) console.error(JSON.stringify(e.body, null, 2));
  process.exit(1);
});
