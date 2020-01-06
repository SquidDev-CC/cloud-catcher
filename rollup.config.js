import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";

export default {
  input: 'build/viewer/index.js',
  output: {
    file: 'public/assets/main.js',
    format: 'amd',
    amd: {
      id: "cloud-catcher",
    },
    paths: {
      // So ideally we could map to editor.main, but that doesn't export
      // anything, so we depend on the two in our index (as <script> tags and as requires).
      "monaco-editor": "vs/editor/editor.api",
    },
  },
  plugins: [
    resolve(),
    commonjs({
      include: 'node_modules/**'
    }),
  ],
  external: ["monaco-editor"],
};
