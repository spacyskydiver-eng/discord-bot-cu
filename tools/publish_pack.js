// Publish a player modpack release on cuevents.xyz (testers and staff only since S85):
//   node tools/publish_pack.js <file.mrpack> <version> <expected-sha256>
// Checks the SHA-256 against the release's, uploads the file to the storage bucket under a random, unlisted key (so no
// public address can be guessed; the key lives only in the site's settings), checks the uploaded copy byte for byte,
// keeps the current release as `pack_release_prev`, then sets `pack_release`. The site serves it only through /pack/get.
require('dotenv').config();
const fs = require('fs'), crypto = require('crypto'), path = require('path'), { execFileSync } = require('child_process');
const access = require('../server/access');

(async () => {
  const [file, version, expected] = process.argv.slice(2);
  if (!file || !version || !expected) throw new Error('usage: node tools/publish_pack.js <file.mrpack> <version> <expected-sha256>');
  const data = fs.readFileSync(file), sha = crypto.createHash('sha256').update(data).digest('hex');
  if (expected.toLowerCase() !== sha) throw new Error(`SHA-256 mismatch: release says ${expected}, file is ${sha}`);
  const name = `the-great-war-${version}.mrpack`, key = `pack/${crypto.randomBytes(24).toString('hex')}/${name}`;
  const cwd = path.join(process.env.HOME, 'Library/Application Support/cue-arsenal');   // where wrangler is signed in
  execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `cue-arsenal/${key}`, '--file', path.resolve(file), '--content-type', 'application/octet-stream', '--remote'], { cwd, stdio: 'ignore' });
  const base = new URL(await access.getSetting('arsenal_manifest_url')).origin, source = `${base}/${key}`;
  const back = Buffer.from(await (await fetch(source)).arrayBuffer());
  if (crypto.createHash('sha256').update(back).digest('hex') !== sha) throw new Error('the uploaded copy does not match; not switching on');
  const prev = await access.getSetting('pack_release');
  if (prev) await access.setSetting('pack_release_prev', prev);
  await access.setSetting('pack_release', JSON.stringify({ version, file: name, size: data.length, sha256: sha, source }));
  console.log(`published ${name} (${data.length} bytes, sha256 ${sha}); testers and staff get it from /pack`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
