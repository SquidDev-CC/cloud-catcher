import { promises as fs } from "fs";

import license from "rollup-plugin-license";
import postcss from "rollup-plugin-postcss";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import url from "@rollup/plugin-url";

const out = "build/rollup";

export default {
  input: "src/viewer/index.tsx",
  output: {
    dir: out,
    format: "amd",
    paths: {
      "monaco-editor": "vs/editor/editor.main",
    },
    preferConst: true,
  },
  context: "window",
  external: ["monaco-editor"],

  plugins: [
    postcss({
      extract: true,
      namedExports: true,
      modules: true,
    }),
    url({
      limit: 1024,
      fileName: "[name]-[hash][extname]",
      include: ["**/*.worker.js", "**/*.png"],
    }),

    typescript(),
    resolve({ mainFields: ["module", "browser", "main"], }),
    // commonjs(),

    license({
      banner:
        `<%= pkg.name %>: Copyright <%= pkg.author %> <%= moment().format('YYYY') %>
<% _.forEach(_.sortBy(dependencies, ["name"]), ({ name, author, license }) => { %>
  - <%= name %>: Copyright <%= author ? author.name : "" %> (<%= license %>)<% }) %>

@license
  `,
      thirdParty: { output: `${out}/dependencies.txt` },
    }),

    {
      name: "cloud-catcher",
      async writeBundle () {
        await Promise.all([
          fs.copyFile("node_modules/requirejs/require.js", `${out}/require.js`),
          ...(["index.html", "404.html", "loader.js"].map(file =>
            fs.copyFile(`public/${file}`, `${out}/${file}`)
          )),
        ]);
      },
    },
  ],
};
