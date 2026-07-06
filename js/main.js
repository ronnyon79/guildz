/* main.js — boot. Wires the store to the renderer and kicks off the first paint.
 * In multiplayer this is where you'd open the socket connection instead. */
(function (root) {
  const G = root.G;
  // Re-render on every state change.
  G.game.subscribe((state) => G.ui.render(state));
  // Storage first (IndexedDB in browsers, localStorage fallback), then boot
  // to the world-select (migrating any pre-worlds save into slot 1).
  G.store.init().then(() => {
    G.game.boot();
    G.ui.render(G.game.state);
  });
})(typeof window !== "undefined" ? window : globalThis);

// Installable app (GUI-55): register the offline shell, cache keyed to VERSION.
if (typeof navigator !== "undefined" && "serviceWorker" in navigator && location.protocol !== "file:") {
  fetch("VERSION").then((r) => r.text()).catch(() => "dev").then((v) => {
    navigator.serviceWorker.register("sw.js?v=" + (v || "dev").trim()).catch(() => {});
  });
}
