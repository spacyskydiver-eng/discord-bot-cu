// Uploads the campaign map to the database the site reads it from (the page at /admin/campaign-map has an upload
// box that does the same). The file is kept out of git because the repository is public.
//
//   node tools/upload_campaign_map.js [path/to/greatwar_map.json]   (default server/data/greatwar_map.json)
const fs = require('fs');
const db = require('../db');
const campaignMap = require('../server/campaign-map');

(async () => {
  const file = process.argv[2] || campaignMap.FILE;
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const errs = campaignMap.validate(JSON.parse(text));
  if (errs.length) throw new Error('not uploaded:\n  ' + errs.join('\n  '));
  await campaignMap.save(text, 'tools/upload_campaign_map.js');
  const i = await campaignMap.info();
  console.log(`campaign map uploaded: ${i.size} characters at ${new Date(i.updatedAt).toISOString()}`);
  await db.end();
})().catch(e => { console.error(e.message); process.exit(1); });
