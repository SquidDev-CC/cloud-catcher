/** Converts our styles into tsc files */
import fs from "fs";
import postcss from "postcss";
import mkSelector from "postcss-selector-parser";
const selector = mkSelector();

// Convert styles.css into a ts.d file
const contents = fs.readFileSync("src/viewer/styles.css");
const css = postcss.parse(contents, { from: "src/viewer/styles.css" });

const rules = new Set();
css.walkRules(rule => selector.astSync(rule.selector).walkClasses(x => rules.add(x.value)));

const out = Array.from(rules).map(x => `export const ${x}: string;\n`).join("");
fs.writeFileSync("src/viewer/styles.css.d.ts", out);
