module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es6: true
  },
  extends: [
    'eslint:recommended',
  ],
  rules: {
    "semi": ["warn", "always"],
    "quotes": ["warn", "double"],
    "no-constant-condition": ["warn", { checkLoops: false }],
    "arrow-parens": ["warn", "as-needed"],
    "curly": ["warn", "multi-line", "consistent"],
    "indent": ["warn", 2, { SwitchCase: 1 }],
    "no-console": ["warn", { allow: ["error", "warn"] }],
    "object-shorthand": ["warn", "always", { avoidQuotes: true }],
    "quote-props": ["warn", "consistent-as-needed"],
    "no-useless-rename": "warn",
    "sort-imports": ["warn", {
      ignoreDeclarationSort: true
    }],
  },

  overrides: [
    {
      files: ["rollup.config.js"],
      parserOptions: { sourceType: "module" },
    },

    // The default TS config.
    {
      files: ["*.ts", "*.tsx"],
      parser: '@typescript-eslint/parser',
      parserOptions: { project: "tsconfig.json" },
      plugins: [
        '@typescript-eslint',
      ],
      extends: [
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended',
      ],
      rules: {
        "@typescript-eslint/member-delimiter-style": ["warn", {
          multiline: { delimiter: "comma" },
          singleline: { delimiter: "comma" },
          overrides: {
            interface: { multiline: { delimiter: "semi" } },
          },
        }],
        "@typescript-eslint/no-inferrable-types": ["warn", {
          ignoreParameters: true,
          ignoreProperties: true,
        }],
        "@typescript-eslint/no-empty-function": ["warn", {
          allow: ["methods"],
        }],
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/no-non-null-assertion": "off",

        "@typescript-eslint/explicit-member-accessibility": ["warn"],

        // Use Typescript's unused variable warnings instead
        "@typescript-eslint/no-unused-vars": "off",
        "@typescript-eslint/no-unused-vars-experimental": "warn",
      },
    },
  ]
};
