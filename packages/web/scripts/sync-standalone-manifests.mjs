import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const nextRoot = path.join(projectRoot, '.next');
const standaloneRoot = path.join(nextRoot, 'standalone');
const standaloneNextRoot = path.join(standaloneRoot, '.next');
const serverRoot = path.join(nextRoot, 'server');

if (!fs.existsSync(nextRoot) || !fs.existsSync(standaloneRoot)) {
  process.exit(0);
}

fs.mkdirSync(standaloneNextRoot, { recursive: true });

for (const entry of fs.readdirSync(nextRoot, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (!entry.name.endsWith('.json') && entry.name !== 'BUILD_ID') continue;

  const source = path.join(nextRoot, entry.name);
  const target = path.join(standaloneNextRoot, entry.name);
  fs.copyFileSync(source, target);
}

if (fs.existsSync(serverRoot)) {
  fs.cpSync(serverRoot, path.join(standaloneNextRoot, 'server'), {
    recursive: true,
    force: true,
  });
}

const nestedServerPath = fs.existsSync(path.join(standaloneRoot, 'server.js'))
  ? path.join(standaloneRoot, 'server.js')
  : findNestedServer(standaloneRoot);

if (nestedServerPath) {
  const nestedRoot = path.dirname(nestedServerPath);
  fs.copyFileSync(nestedServerPath, path.join(standaloneRoot, 'server.js'));

  const nestedNodeModules = path.join(nestedRoot, 'node_modules');
  if (fs.existsSync(nestedNodeModules)) {
    fs.cpSync(nestedNodeModules, path.join(standaloneRoot, 'node_modules'), {
      recursive: true,
      force: true,
    });
  }

  const nestedPackageJson = path.join(nestedRoot, 'package.json');
  if (fs.existsSync(nestedPackageJson)) {
    fs.copyFileSync(nestedPackageJson, path.join(standaloneRoot, 'package.json'));
  }
}

console.log(`Synced Next manifests into ${path.relative(projectRoot, standaloneNextRoot)}`);

function findNestedServer(root) {
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === 'server.js') {
        return fullPath;
      }
    }
  }

  return null;
}
