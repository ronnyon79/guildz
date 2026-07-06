/* store.js — the storage adapter (GUI-21/22). Game logic never touches a
 * backend directly: it calls G.store, and the backend swaps underneath —
 * exactly the discipline of the combat/AI seam, applied to persistence.
 *
 * Backends:
 *  - localStorage (default; also headless/tests): a pure synchronous
 *    pass-through — behaviour identical to the pre-adapter era.
 *  - IndexedDB (browsers; the design-v5 "big DB"): an in-memory mirror is
 *    hydrated once at boot (async init), reads are sync against the mirror,
 *    writes flow through asynchronously. Any pre-existing localStorage save
 *    is migrated into IndexedDB on first boot. GBs of room for the
 *    fact/rollup stores that a full-fidelity kingdom needs (GUI-22).
 */
(function (root) {
  const G = (root.G = root.G || {});
  const mem = new Map();
  let idb = null;

  const ls = () => (typeof root.localStorage !== "undefined" ? root.localStorage : null);

  function get(k) {
    if (idb) return mem.has(k) ? mem.get(k) : null;
    const l = ls();
    return l ? l.getItem(k) : null;
  }
  function set(k, v) {
    if (idb) {
      mem.set(k, String(v));
      try { idb.transaction("kv", "readwrite").objectStore("kv").put(String(v), k); } catch (e) {}
      return;
    }
    const l = ls();
    if (l) { try { l.setItem(k, String(v)); } catch (e) {} }
  }
  function remove(k) {
    if (idb) {
      mem.delete(k);
      try { idb.transaction("kv", "readwrite").objectStore("kv").delete(k); } catch (e) {}
      return;
    }
    const l = ls();
    if (l) { try { l.removeItem(k); } catch (e) {} }
  }

  // Async boot: open IndexedDB, hydrate the mirror, migrate any legacy
  // localStorage world in. Resolves with the backend name; falls back cleanly.
  function init() {
    if (typeof root.indexedDB === "undefined") return Promise.resolve("localStorage");
    return new Promise((resolve) => {
      let req;
      try { req = root.indexedDB.open("guildz", 1); } catch (e) { resolve("localStorage"); return; }
      req.onupgradeneeded = () => { req.result.createObjectStore("kv"); };
      req.onerror = () => resolve("localStorage");
      req.onsuccess = () => {
        idb = req.result;
        const tx = idb.transaction("kv", "readonly").objectStore("kv").openCursor();
        tx.onsuccess = (e) => {
          const cur = e.target.result;
          if (cur) { mem.set(cur.key, cur.value); cur.continue(); return; }
          // Hydrated. First boot: pull any pre-IDB saves across.
          const l = ls();
          if (l && mem.size === 0) {
            for (let i = 0; i < l.length; i++) {
              const k = l.key(i);
              if (k && k.indexOf("guildz") === 0) set(k, l.getItem(k));
            }
          }
          resolve("indexedDB");
        };
        tx.onerror = () => resolve("indexedDB");
      };
    });
  }

  G.store = { get, set, remove, init, backend: () => (idb ? "indexedDB" : "localStorage") };
})(typeof window !== "undefined" ? window : globalThis);
