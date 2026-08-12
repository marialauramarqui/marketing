/* ------------------------- resposta + cache de borda ------------------------- */
export async function withCache(context, maxAgeSeconds, compute) {
  const { request } = context;
  const url = new URL(request.url);
  const bypass = url.searchParams.has("fresh"); // o botão "Atualizar" pede sempre dados novos (ignora o cache)
  const cache = caches.default;
  // chave sem query: um clique "fresh" também aquece o cache para os acessos normais seguintes
  const cacheKey = new Request(url.origin + url.pathname, { method: "GET" });

  if (!bypass) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  const cors = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" };
  try {
    const data = await compute();
    const resp = new Response(JSON.stringify(data), {
      headers: { ...cors, "Cache-Control": `public, max-age=${maxAgeSeconds}` },
    });
    context.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  } catch (e) {
    const status = e.status === 401 || e.status === 403 ? 502 : 503;
    return new Response(JSON.stringify({ erro: String(e.message || e) }), {
      status,
      headers: { ...cors, "Cache-Control": "no-store" },
    });
  }
}
