/* main.js — boot. Wires the store to the renderer and kicks off the first paint.
 * In multiplayer this is where you'd open the socket connection instead. */
(function (root) {
  const G = root.G;
  // Re-render on every state change.
  G.game.subscribe((state) => G.ui.render(state));
  // Boot to the world-select (migrating any pre-worlds save into slot 1).
  G.game.boot();
  G.ui.render(G.game.state);
})(typeof window !== "undefined" ? window : globalThis);
