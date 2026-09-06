// ponytail: hardlinking .env.local across apps looked elegant but silently breaks
// whenever any tool saves via write-temp+rename (NTFS hardlinks don't survive that,
// and most editors do it). This runs before every dev/build so root stays the real
// source of truth no matter what state the hardlinks are in -- upgrade to a watcher
// only if editing .env.local *without* running dev/build afterward becomes common.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = path.join(root, '.env.local');
const targets = [
  path.join(root, 'apps', 'booking-admin', '.env.local'),
  path.join(root, 'apps', 'booking-consumer', '.env.local'),
];

if (!fs.existsSync(source)) {
  console.error(`sync-env: ${source} not found, nothing to sync`);
  process.exit(1);
}

const content = fs.readFileSync(source);
for (const target of targets) {
  fs.writeFileSync(target, content);
  console.log(`sync-env: synced -> ${path.relative(root, target)}`);
}
