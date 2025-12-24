module.exports = {
  root: true,
<<<<<<< HEAD
  extends: [
    'airbnb-base',
    'plugin:json/recommended',
    'plugin:xwalk/recommended',
  ],
=======
  extends: 'airbnb-base',
>>>>>>> 698582f (Squashed 'plugins/experimentation/' content from commit 0356a22)
  env: {
    browser: true,
  },
  parser: '@babel/eslint-parser',
  parserOptions: {
    allowImportExportEverywhere: true,
    sourceType: 'module',
    requireConfigFile: false,
  },
  rules: {
<<<<<<< HEAD
    'import/extensions': ['error', { js: 'always' }], // require js file extensions in imports
    'linebreak-style': ['error', 'unix'], // enforce unix linebreaks
    'no-param-reassign': [2, { props: false }], // allow modifying properties of param
=======
    // allow reassigning param
    'no-param-reassign': [2, { props: false }],
    'linebreak-style': ['error', 'unix'],
    'import/extensions': ['error', {
      js: 'always',
    }],
>>>>>>> 698582f (Squashed 'plugins/experimentation/' content from commit 0356a22)
  },
};
