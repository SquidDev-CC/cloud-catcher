import resolve from 'rollup-plugin-node-resolve';

export default {
  input: 'build/viewer/index.js',
  output: {
    file: 'public/assets/main.js',
    format: 'iife',
    globals: {
      "ace": "ace",
    }
  },
  plugins: [
    resolve(),
  ],
  external: ["ace"],
};
