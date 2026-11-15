// Copies the browser builds of the render libraries into extension/lib
// (MV3 pages cannot load remote scripts).
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MODULES = join(ROOT, "node_modules");
const OUT = join(ROOT, "extension", "lib");
mkdirSync(OUT, { recursive: true });

const files = {
  "marked.umd.js": "marked/lib/marked.umd.js",
  "purify.min.js": "dompurify/dist/purify.min.js",
  "highlight.min.js": "@highlightjs/cdn-assets/highlight.min.js",
};
for (const [name, src] of Object.entries(files)) {
  copyFileSync(join(MODULES, src), join(OUT, name));
  console.log("lib/" + name);
}
