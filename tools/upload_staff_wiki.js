// Uploads the staff wiki (Design Document) to the database the site reads it from.
// The file is kept out of git because the repository is public.
//
//   python3 tools/wiki_from_pdf.py "The Great War — Design Document.pdf" content/wiki/staff.md
//   python3 tools/verify_wiki.py "The Great War — Design Document.pdf" content/wiki/staff.md
//   node tools/upload_staff_wiki.js
const fs = require('fs');
const path = require('path');
const db = require('../db');

(async () => {
  const file = path.join(__dirname, '../content/wiki/staff.md');
  const markdown = fs.readFileSync(file, 'utf8');
  await db.query(`CREATE TABLE IF NOT EXISTS wiki_content (version TEXT PRIMARY KEY, markdown TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`);
  await db.query(
    `INSERT INTO wiki_content (version, markdown, updated_at) VALUES ('staff', $1, NOW())
     ON CONFLICT (version) DO UPDATE SET markdown = EXCLUDED.markdown, updated_at = NOW()`, [markdown]);
  const row = (await db.query(`SELECT length(markdown) AS chars, updated_at FROM wiki_content WHERE version = 'staff'`)).rows[0];
  console.log(`staff wiki uploaded: ${row.chars} characters at ${row.updated_at.toISOString()}`);
  await db.end();
})().catch(e => { console.error(e.message); process.exit(1); });
