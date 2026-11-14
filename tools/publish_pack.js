// Publish a player modpack release on cuevents.xyz:
//   node tools/publish_pack.js <file.mrpack> <version> [expected-sha256]
// Checks the SHA-256 (against the release's, if given), uploads the file to the site's storage bucket with wrangler,
// checks the uploaded copy byte for byte, then sets site setting `pack_release`, which switches /pack's download on.
// The bucket's public address is read from the existing arsenal setting, so it never goes in this public repo.
require('dotenv').config();
const fs = require('fs'), crypto = require('crypto'), path = require('path'), { execFileSync } = require('child_process');
const access = require('../server/access');

(async () => {
  const [file, version, expected] = process.argv.slice(2);
  if (!file || !version) throw new Error('usage: node tools/publish_pack.js <file.mrpack> <version> [expected-sha256]');
  const data = fs.readFileSync(file), sha = crypto.createHash('sha256').update(data).digest('hex');
  if (expected && expected.toLowerCase() !== sha) throw new Error(`SHA-256 mismatch: release says ${expected}, file is ${sha}`);
  const name = `the-great-war-${version}.mrpack`, key = `pack/${name}`;
  const cwd = path.join(process.env.HOME, 'Library/Application Support/cue-arsenal');   // where wrangler is signed in
  execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `cue-arsenal/${key}`, '--file', path.resolve(file), '--remote'], { cwd, stdio: 'inherit' });
  const base = new URL(await access.getSetting('arsenal_manifest_url')).origin, source = `${base}/${key}`;
  const back = Buffer.from(await (await fetch(source)).arrayBuffer());
  if (crypto.createHash('sha256').update(back).digest('hex') !== sha) throw new Error('the uploaded copy does not match; not switching on');
  await access.setSetting('pack_release', JSON.stringify({ version, file: name, size: data.length, sha256: sha, source }));
  console.log(`published ${name} (${data.length} bytes, sha256 ${sha}); live at https://cuevents.xyz/download/${name} within a minute`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
