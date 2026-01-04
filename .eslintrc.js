module.exports = {
  extends: ['react-app', 'react-app/jest', 'prettier'],
  rules: {
    'no-console': 'warn',
  },
  ignorePatterns: ['build/', 'node_modules/', '/*.config.js'],
};
