const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
      'no-prototype-builtins': 'off',
    },
  },
];
