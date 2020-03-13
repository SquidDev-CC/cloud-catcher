import commonjs from "@rollup/plugin-commonjs";
import license from "rollup-plugin-license"
import postcss from 'rollup-plugin-postcss';
import resolve from "@rollup/plugin-node-resolve";
import url from '@rollup/plugin-url';

export default {
  input: 'build/typescript/viewer/index.js',
  output: {
    dir: 'build/rollup/',
    format: 'amd',
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
      namedExports: name => name.replace(/-([a-z])/g, (_, x) => x.toUpperCase()),
      modules: true,
    }),
    url({
      limit: 1024,
      fileName: '[name]-[hash][extname]',
      include: ['**/*.worker.js', '**/*.png'],
    }),

    resolve({ mainFields: ['module', 'browser', 'main'], }),
    commonjs(),

    license({
      banner:
        `<%= pkg.name %>: Copyright <%= pkg.author %> <%= moment().format('YYYY') %>
<% _.forEach(_.sortBy(dependencies, ["name"]), ({ name, author, license }) => { %>
  - <%= name %>: Copyright <%= author ? author.name : "" %> (<%= license %>)<% }) %>

@license
  `,
      thirdParty: { output: "build/rollup/dependencies.txt" },
    }),
  ],
};
