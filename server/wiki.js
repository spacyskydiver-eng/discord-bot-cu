// Renders the wiki for the site.
// The player wiki (Field Manual) is content/wiki/player.md in the repo.
// The staff wiki (Design Document) is never in the repo, which is public: it lives in the
// wiki_content table (uploaded with tools/upload_staff_wiki.js) and is only ever served through
// the staff-gated endpoint in routes/pages.js. A local content/wiki/staff.md is used if present.
const fs = require('fs');
const path = require('path');
const MarkdownIt = require('markdown-it');

const DIR = path.join(__dirname, '../content/wiki');
const FILES = { player: path.join(DIR, 'player.md'), staff: path.join(DIR, 'staff.md') };

const md = new MarkdownIt({ html: true, linkify: false, typographer: false });

// "3.5.6 Title" -> "3-5-6", "Module 3: Title" -> "3"
function headingId(text, used) {
  let id;
  const num = text.match(/^(\d+(?:\.\d+)*)\s/);
  const mod = text.match(/^Module (\d+)\b/);
  if (num) id = num[1].replace(/\./g, '-');
  else if (mod) id = mod[1];
  else id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
  let out = id, n = 2;
  while (used.has(out)) out = `${id}-${n++}`;
  used.add(out);
  return out;
}

const decode = s => s.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

function render(source) {
  const tokens = md.parse(source, {});
  const used = new Set();
  const toc = [];
  const tables = [];
  let title = '';
  let table = null, row = null, inHead = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'heading_open') {
      const text = tokens[i + 1].content;
      const level = +t.tag.slice(1);
      if (level === 1 && !title) { title = text; t.attrSet('class', 'wk-title'); continue; }
      const id = headingId(text, used);
      t.attrSet('id', id);
      toc.push({ id, level, text });
      // a link to copy for every numbered section
      tokens[i + 1].children.push(Object.assign(new (tokens[i].constructor)('html_inline', '', 0), { content: `<a class="wk-anchor" href="#${id}" aria-label="Link to this section">#</a>` }));
    }
    if (t.type === 'table_open') { table = { header: [], rows: [] }; t.attrSet('class', 'wk-table'); }
    if (t.type === 'thead_open') inHead = true;
    if (t.type === 'thead_close') inHead = false;
    if (t.type === 'tr_open') row = [];
    if ((t.type === 'th_open' || t.type === 'td_open') && row) row.push(decode(md.renderInline(tokens[i + 1].content)));
    if (t.type === 'tr_close' && table) { if (inHead) table.header = row; else table.rows.push(row); row = null; }
    if (t.type === 'table_close') { tables.push(table); table = null; }
  }
  let html = md.renderer.render(tokens, md.options, {});
  html = html.replace(/<table class="wk-table">/g, '<div class="wk-table-wrap"><table class="wk-table">').replace(/<\/table>/g, '</table></div>');
  // module and section wrappers, so the page can be read and linked section by section
  // plain text in reading order, with ordered-list numbers, for search and for checking against the PDF
  const parts = [], counters = [];
  for (const t of tokens) {
    if (t.type === 'ordered_list_open') counters.push(+(t.attrGet('start') || 1));
    else if (t.type === 'bullet_list_open') counters.push(null);
    else if (t.type === 'ordered_list_close' || t.type === 'bullet_list_close') counters.pop();
    else if (t.type === 'list_item_open' && counters.length && counters[counters.length - 1] !== null) parts.push(`${counters[counters.length - 1]++}.`);
    else if (t.type === 'inline') parts.push(decode(md.renderInline(t.content)));
  }
  const text = parts.join(' ');
  return { title, html, toc, tables, text };
}

const cache = {};
const shape = (version, r) => ({ version, title: r.title, html: r.html, toc: r.toc });

// from a file: re-rendered when the file changes
function fromFile(version) {
  const file = FILES[version];
  const mtime = fs.statSync(file).mtimeMs;
  if (!cache[version] || cache[version].stamp !== mtime) cache[version] = { stamp: mtime, data: shape(version, render(fs.readFileSync(file, 'utf8'))) };
  return cache[version].data;
}

// from the database: checked at most once a minute, re-rendered when the upload changes
let db = null;
async function fromDb(version) {
  const c = cache[version];
  if (c && Date.now() - c.checked < 60 * 1000) return c.data;
  db = db || require('../db');
  const row = (await db.query(`SELECT markdown, updated_at FROM wiki_content WHERE version = $1`, [version])).rows[0];
  if (!row) throw new Error('no ' + version + ' wiki uploaded');
  const stamp = new Date(row.updated_at).getTime();
  if (!c || c.stamp !== stamp) cache[version] = { stamp, data: shape(version, render(row.markdown)) };
  cache[version].checked = Date.now();
  return cache[version].data;
}

function getPlayer() { return fromFile('player'); }
async function getStaff() { return fs.existsSync(FILES.staff) ? fromFile('staff') : fromDb('staff'); }

function renderFile(file) { return render(fs.readFileSync(file, 'utf8')); }

module.exports = { getPlayer, getStaff, renderFile };
