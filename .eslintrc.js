module.exports = {
  root: true,

  extends: [
    '@metamask/eslint-config',
    '@metamask/eslint-config/config/nodejs',
  ],

  plugins: [
    'json',
  ],

  parserOptions: {
    ecmaVersion: 2018,
  },

  overrides: [
    {
      files: ['test/index.js'],
      rules: {
        'import/no-unresolved': 'off',
      },
    },
  ],

  ignorePatterns: [
    '!.eslintrc.js',
    'dist',
  ],
}
