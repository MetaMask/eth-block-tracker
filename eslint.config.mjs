import base, { createConfig } from '@metamask/eslint-config';
import jest from '@metamask/eslint-config-jest';
import nodejs from '@metamask/eslint-config-nodejs';
import typescript from '@metamask/eslint-config-typescript';

const config = createConfig([
  {
    ignores: ['dist/', 'docs/', '.yarn/'],
  },

  {
    extends: base,

    languageOptions: {
      sourceType: 'module',
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        project: ['./tsconfig.json'],
      },
    },

    settings: {
      'import-x/extensions': ['.js', '.mjs'],
    },
  },

  {
    files: ['**/*.ts'],
    extends: typescript,
    rules: {
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/unbound-method': 'warn',
      'id-denylist': 'off',
      'id-length': 'off',
      // TODO: Enable
      '@typescript-eslint/explicit-function-return-type': 'warn',
      // TODO: Move this to our shared config
      'no-invalid-this': 'off',
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-invalid-this': ['error'],
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },

  {
    files: ['**/*.js', '**/*.cjs'],
    extends: nodejs,

    languageOptions: {
      sourceType: 'script',
    },
  },

  {
    files: ['./test/**/*', '**/*.test.ts', '**/*.test.js'],
    extends: [jest, nodejs],
    rules: {
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-throw-literal': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      'id-denylist': 'off',
      'import-x/no-nodejs-modules': 'off',
      'no-restricted-globals': 'off',
    },
  },
]);

export default config;
