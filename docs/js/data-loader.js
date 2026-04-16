window.DataLoader = (function () {
  async function load() {
    const url = `data/data.json?_=${Date.now()}`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`Falha ao carregar data.json (HTTP ${r.status})`);
    return await r.json();
  }
  return { load };
})();
