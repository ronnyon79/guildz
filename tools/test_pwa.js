/* test_pwa.js — GUI-55: installability artifacts are present and coherent. */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log("  ✓", label); } else { fail++; console.log("  ✗ FAIL", label); } };
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

console.log("— manifest —");
const man = JSON.parse(read("manifest.webmanifest"));
ok(man.name && man.short_name === "Guildz", "name + short_name");
ok(man.display === "standalone" && man.theme_color === "#1a1423", "standalone + theme colour");
ok(man.icons.length === 2 && man.icons.every((i) => i.type === "image/png"), "two PNG icons declared");

console.log("— icons are real PNGs —");
for (const s of [192, 512]) {
  const buf = fs.readFileSync(path.join(root, `icons/icon-${s}.png`));
  ok(buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), `icon-${s} has the PNG signature`);
  ok(buf.readUInt32BE(16) === s && buf.readUInt32BE(20) === s, `icon-${s} is ${s}×${s}`);
}

console.log("— service worker —");
const sw = read("sw.js");
new Function(sw.replace(/self\./g, "({addEventListener(){}}).")); // parses
ok(true, "sw.js parses");
ok(/network-first|fetch\(e\.request\)/i.test(sw), "network-first strategy (updates never stick)");
ok(sw.includes('caches.delete'), "old version caches are swept");
const shellFiles = sw.match(/"[^"]+\.(js|css|html|png|webmanifest)"/g).map((s) => s.slice(1, -1));
ok(shellFiles.every((f) => fs.existsSync(path.join(root, f))), "every shell asset exists on disk");

console.log("— wiring —");
const html = read("index.html");
ok(html.includes('rel="manifest"') && html.includes("manifest.webmanifest"), "index links the manifest");
ok(html.includes('name="theme-color"') && html.includes("apple-touch-icon"), "theme colour + apple icon");
const main = read("js/main.js");
ok(main.includes("serviceWorker") && main.includes('location.protocol !== "file:"'), "registration guarded for browsers");
ok(main.includes('sw.js?v='), "cache version keyed to VERSION");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
