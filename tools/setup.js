/** Converts our styles into tsc files */
const fs = require("fs");
const postcss = require("postcss");
const selector = require('postcss-selector-parser')();

// Convert styles.css into a ts.d file
const contents = fs.readFileSync("src/viewer/styles.css");
const css = postcss.parse(contents, { from: "src/viewer/styles.css" });

const rules = new Set();
css.walkRules(rule => selector.astSync(rule.selector).walkClasses(x => rules.add(x.value)));

const out = Array.from(rules).map(x => `export const ${x.replace(/-/g, "_")} : string;\n`).join("");
fs.writeFileSync("src/viewer/styles.css.d.ts", out);

fs.mkdirSync("build/typescript/viewer", { recursive: true });
fs.mkdirSync("build/rollup", { recursive: true });

// Copy a bunch of files
fs.copyFileSync("src/viewer/styles.css", "build/typescript/viewer/styles.css");
fs.copyFileSync("node_modules/requirejs/require.js", "build/rollup/require.js");

for (const file of ["index.html", "404.html", "loader.js"]) {
    fs.copyFileSync(`public/${file}`, `build/rollup/${file}`);
}
