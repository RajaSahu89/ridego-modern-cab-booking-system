import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const dir of ['backend', 'frontend']) {
  const example = path.join(root, dir, '.env.example');
  const target = path.join(root, dir, '.env');
  if (fs.existsSync(target)) {
    console.log(`${dir}/.env already exists, left as is.`);
    continue;
  }
  let text = fs.readFileSync(example, 'utf8');
  text = text.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${crypto.randomBytes(32).toString('hex')}`);
  fs.writeFileSync(target, text);
  console.log(`Created ${dir}/.env`);
}
console.log('\nNext: open backend/.env, set DATABASE_URL (see the comments in that file), then run: npm run db:setup');
