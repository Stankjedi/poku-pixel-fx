#!/usr/bin/env node
// Bundle the gallery into dist/gallery (a static site: GitHub Pages or any host) and dist/page (one page plus
// one script, fonts inlined, for hosts that take a page body).
//
//   node build-tools/tools/index.mjs && node build-tools/tools/build-gallery.mjs

import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/fxlib.mjs";

const G = join(ROOT, "gallery"), OUT = join(ROOT, "dist", "gallery"), PAGE = join(ROOT, "dist", "page");
mkdirSync(OUT, { recursive: true });
mkdirSync(PAGE, { recursive: true });

for (const dir of [OUT, PAGE]) rmSync(join(dir, "chunks"), { recursive: true, force: true });
await build({ entryPoints: ["app", "3d", "studio", "studio-worker", "gpu-lab", "gpu-lab-worker"].map(name => join(G, name + ".ts")),
  bundle: true, splitting: true, format: "esm", minify: true, outdir: OUT, chunkNames: "chunks/[name]-[hash]", legalComments: "none" });
cpSync(join(G, "3d.html"), join(OUT, "3d.html"));
for (const name of ["studio.html", "studio.css", "gpu-lab.html"]) cpSync(join(G, name), join(OUT, name));
cpSync(join(G, "fonts"), join(OUT, "fonts"), { recursive: true });
cpSync(join(G, "fonts"), join(PAGE, "fonts"), { recursive: true });
writeFileSync(join(OUT, "style.css"), readFileSync(join(G, "style.css")));
writeFileSync(join(OUT, "index.html"), readFileSync(join(G, "index.html")));
// Keep the complete notices alongside both publicly served distributions.
for (const destination of [OUT, PAGE]) {
  cpSync(join(G, "licenses.html"), join(destination, "licenses.html"));
  cpSync(join(ROOT, "LICENSE"), join(destination, "LICENSE.txt"));
  cpSync(join(ROOT, "NOTICE.md"), join(destination, "NOTICE.txt"));
  cpSync(join(ROOT, "licenses", "HOLLOW-CROWN.txt"), join(destination, "HOLLOW-CROWN-LICENSE.txt"));
}

// the one-page version: <title> and <style> first, then the body markup, the font as a data URI
const html = readFileSync(join(G, "index.html"), "utf8");
const body = html.slice(html.indexOf("<!--BODY-->") + 11, html.indexOf("<!--/BODY-->"));
const font = readFileSync(join(G, "fonts", "PokuPixel-Regular.ttf")).toString("base64");
const css = readFileSync(join(G, "style.css"), "utf8").replace("url(fonts/PokuPixel-Regular.ttf)", `url(data:font/ttf;base64,${font})`);
writeFileSync(
  join(PAGE, "index.html"),
  [
    "<title>poku-pixel-fx</title>",
    '<meta name="claude:viewport-fit-sides" content="cover">',
    `<style>\n${css}\n</style>`,
    body.trim(),
    '<script type="module" src="app.js"></script>',
  ].join("\n"),
);
cpSync(join(OUT, "app.js"), join(PAGE, "app.js"));
cpSync(join(OUT, "3d.html"), join(PAGE, "3d.html"));
cpSync(join(OUT, "3d.js"), join(PAGE, "3d.js"));
for (const name of ["studio.js", "studio-worker.js", "studio.html", "studio.css", "gpu-lab.js", "gpu-lab-worker.js", "gpu-lab.html"]) cpSync(join(OUT, name), join(PAGE, name));
if (existsSync(join(OUT, "chunks"))) cpSync(join(OUT, "chunks"), join(PAGE, "chunks"), { recursive: true });
console.log(`dist/gallery 및 dist/page 빌드 완료 (스크립트 ${(readFileSync(join(OUT, "app.js")).length / 1024).toFixed(0)} KB)`);

