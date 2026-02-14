import fs from 'node:fs';
import path from 'node:path';

const roots = ['src', 'web/src'];
const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs']);
const markerPattern = /^(<<<<<<<\s.+|=======|>>>>>>>\s.+)$/m;

const files = [];

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (exts.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
};

for (const root of roots) {
  if (fs.existsSync(root)) walk(root);
}

const hits = [];
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (markerPattern.test(content)) {
    hits.push(file);
  }
}

if (hits.length > 0) {
  console.error('❌ Conflict markers found in source files:');
  for (const hit of hits) console.error(` - ${hit}`);
  process.exit(1);
}

console.log(`✅ No conflict markers found in ${files.length} source files.`);
