/* Só ativos públicos de contingência. Nunca armazena APIs, documentos autenticados ou cookies. */
const CACHE='sobral-chao-publico-v1';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/chao-offline.html','/sobral-s.svg']))));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);if(u.origin!==self.location.origin||event.request.method!=='GET')return;
 if(event.request.mode==='navigate'&&/^\/(apontamento-operacoes|apontamento\/)/.test(u.pathname))event.respondWith(fetch(event.request).catch(()=>caches.match('/chao-offline.html')));
});
