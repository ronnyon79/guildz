/* sw.js — Guildz offline shell (GUI-55).
 * Network-first with cache fallback: online players always get the newest
 * build (no sticky-update problem); offline players get the last one cached.
 * The cache name is bumped by VERSION at register time (?v=), so old caches
 * are swept on activate. */
const VERSION = new URL(self.location).searchParams.get("v") || "dev";
const CACHE = "guildz-" + VERSION;
const SHELL = [
  ".", "index.html", "style.css", "manifest.webmanifest",
  "js/engine.js", "js/store.js", "js/data.js", "js/combat.js", "js/spectacle.js",
  "js/ai.js", "js/tournament.js", "js/roster.js", "js/worldgen.js", "js/game.js",
  "js/lord.js", "js/ui.js", "js/main.js",
  "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("guildz-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
