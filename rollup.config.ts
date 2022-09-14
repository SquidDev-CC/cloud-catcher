import commonjs from "@rollup/plugin-commonjs";
import html, { makeHtmlAttributes, RollupHtmlTemplateOptions } from "@rollup/plugin-html";
import nodeResolve, { RollupNodeResolveOptions } from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import typescript from "@rollup/plugin-typescript";
import url from "@rollup/plugin-url";
import { promises as fs } from "fs";
import MagicString from "magic-string";
import type { OutputChunk, OutputOptions, Plugin, RollupOptions } from "rollup";
import license from "rollup-plugin-license";
import livereload from 'rollup-plugin-livereload';
import postcss from "rollup-plugin-postcss";
import { terser } from 'rollup-plugin-terser';

const production = !process.env.ROLLUP_WATCH;

const makeTemplate = (filename: string) => async (options?: RollupHtmlTemplateOptions): Promise<string> => {
  if (!options) throw new Error("Must specify RollupHtmlTemplateOptions");
  const { attributes, files, publicPath } = options;

  const entrypoints = (files.js ?? []).filter(x => (x as OutputChunk).isEntry);
  if (entrypoints.length > 1) throw new Error("Too many entrypoints!")
  const scripts = entrypoints
    .map(({ fileName }) => `<script data-main="${publicPath}${fileName}" src="${publicPath}/require.js" ${makeHtmlAttributes(attributes.script)}></script>`)
    .join("\n");

  const links = (files.css || [])
    .map(({ fileName }) => `<link href="${publicPath}${fileName}" rel="stylesheet"${makeHtmlAttributes(attributes.link)}>`)
    .join("\n");

  const templateFields: { [filed: string]: unknown } = { scripts, links };

  const template = await fs.readFile(filename, { encoding: "utf-8" });
  return template.replace(/\$\{([^}]+)\}/g, (_, name) => {
    const value = templateFields[name];
    if (value === undefined) throw new Error(`Unknown field ${name}`);
    return `${value}`;
  });
};

const defaultOutput: OutputOptions = {
  preferConst: true,
  freeze: true,
}

const defaultPlugins = (
  { resolve, outDir, strict }: { resolve: RollupNodeResolveOptions, outDir: string, strict: boolean },
): Array<Plugin> => [
    nodeResolve({
      moduleDirectories: ["node_modules"],
      modulePaths: (process.env.NODE_PATH ?? "").split(/[;:]/),
      ...resolve,
    }),
    commonjs({ strictRequires: true }),
    typescript({
      sourceMap: true,
      inlineSources: true,
      outDir,
      noEmitOnError: strict,
    }),
  ]

const site = (): RollupOptions => {
  const outDir = "_site";
  return {
    input: "src/viewer/index.tsx",
    output: {
      ...defaultOutput,
      dir: outDir,
      format: "amd",
      entryFileNames: "[name]-[hash].js",

      paths: {
        "monaco-editor": "vs/editor/editor.main",
      },
      sourcemap: true,
    },
    context: "window",
    external: ["monaco-editor"],

    plugins: [
      replace({
        preventAssignment: true,
        __monaco__: "https://cdn.jsdelivr.net/npm/monaco-editor@0.34.0",
      }),

      postcss({
        extract: true,
        namedExports: true,
        modules: true,
        minimize: production,
      }),
      url({
        limit: 1024,
        fileName: "[name]-[hash][extname]",
        include: ["**/*.worker.js", "**/*.png"],
      }),

      ...defaultPlugins({
        outDir,
        resolve: { browser: true },
        strict: production,
      }),

      license({
        banner:
          `<%= pkg.name %>: Copyright <%= pkg.author %> <%= moment().format('YYYY') %>
<% _.forEach(_.sortBy(dependencies, ["name"]), ({ name, author, license }) => { %>
  - <%= name %>: Copyright <%= author ? author.name : "" %> (<%= license %>)<% }) %>

@license
  `,
        thirdParty: { output: `${outDir}/dependencies.txt` },
      }),

      html({ template: makeTemplate("src/viewer/index.html") as any }),
      html({ template: makeTemplate("src/viewer/404.html") as any, fileName: "404.html" }),

      // Setup dev server for dev builds
      !production && livereload(outDir),

      {
        name: "cloud-catcher",
        async writeBundle() {
          await Promise.all([
            fs.copyFile("node_modules/requirejs/require.js", `${outDir}/require.js`),
          ]);
        }
      },

      // Otherwise minify
      production && terser(),
    ],
    watch: {
      clearScreen: false
    }
  };
};

const server = (): RollupOptions => {
  const outDir = "_bin";
  const outFile = `${outDir}/server.cjs`;
  return {
    input: "src/server/index.ts",
    output: {
      ...defaultOutput,
      file: outFile,
      format: "commonjs",
      sourcemap: true,
      interop: "default",
      externalLiveBindings: false,
    },

    plugins: [
      ...defaultPlugins({
        outDir,
        resolve: { preferBuiltins: true },
        strict: true,
      }),

      {
        name: 'add-cli-entry',
        renderChunk(code, _chunkInfo) {
          const magicString = new MagicString(code);
          magicString.prepend('#!/usr/bin/env node\n');
          return { code: magicString.toString(), map: magicString.generateMap({ hires: true }) };
        },
      },
    ],

  };
}

export default [site(), server()];
