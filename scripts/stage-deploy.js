// Stages what the App Service runs into deploy/: the React build, the Express
// backend, web.config (iisnode serves build/ and runs backend/server.js) and a
// package.json naming only the server's runtime dependencies, pinned to the
// versions npm ci installed. Run after `npm ci && npm run build`, then
// `npm install --omit=dev` inside deploy/ to fetch those dependencies.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'deploy');

// Everything backend/ requires at runtime (tests excluded).
const SERVER_DEPENDENCIES = ['body-parser', 'cors', 'express', 'jose'];

if (!fs.existsSync(path.join(root, 'build', 'index.html'))) {
  throw new Error('No build/index.html: run `npm run build` first');
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);

fs.cpSync(path.join(root, 'build'), path.join(out, 'build'), { recursive: true });
fs.cpSync(path.join(root, 'backend'), path.join(out, 'backend'), {
  recursive: true,
  filter: (src) => !/\.test\.js$|\.env(\..*)?$/.test(path.basename(src)),
});
fs.copyFileSync(path.join(root, 'web.config'), path.join(out, 'web.config'));

const rootPackage = require(path.join(root, 'package.json'));
const dependencies = {};
for (const name of SERVER_DEPENDENCIES) {
  const installed = require(path.join(root, 'node_modules', name, 'package.json'));
  dependencies[name] = installed.version;
}

fs.writeFileSync(
  path.join(out, 'package.json'),
  `${JSON.stringify(
    {
      name: `${rootPackage.name}-server`,
      version: rootPackage.version,
      private: true,
      scripts: { start: 'node backend/server.js' },
      dependencies,
    },
    null,
    2
  )}\n`
);

console.log(`Staged deploy/ with ${Object.entries(dependencies).map(([n, v]) => `${n}@${v}`).join(', ')}`);
