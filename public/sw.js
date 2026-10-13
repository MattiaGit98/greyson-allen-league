/* La PWA non salva pagine o dati: ogni navigazione usa sempre la rete. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request, { cache: "no-store" }).catch(() => new Response(
      '<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#183f34"><title>Connessione assente</title><style>body{min-height:100dvh;display:grid;place-items:center;box-sizing:border-box;margin:0;padding:24px;background:#f4f1e9;color:#183f34;font:16px Arial,sans-serif;text-align:center}h1{font-size:28px}p{line-height:1.5}</style><main><h1>Connessione assente</h1><p>I dati della lega sono disponibili solo online. Riconnettiti e aggiorna la pagina.</p></main></html>',
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    )),
  );
});
