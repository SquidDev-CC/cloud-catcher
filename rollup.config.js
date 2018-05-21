import resolve from 'rollup-plugin-node-resolve';

export default {
  input: 'build/viewer/index.js',
  output: {
    file: 'public/assets/main.js',
    format: 'iife',
    globals: {
      "monaco-editor": "monaco"
    }
  },
  plugins: [
    resolve(),
  ],
  external: ["monaco-editor"],
};
