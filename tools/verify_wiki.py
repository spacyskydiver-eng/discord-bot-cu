#!/usr/bin/env python3
"""Check a converted wiki file against its PDF, word for word and table by table.

Usage:
    python3 tools/verify_wiki.py "The Great War Field Manual.pdf" content/wiki/player.md

1. Renders the Markdown exactly as the site does (server/wiki.js) and compares every word with
   the PDF text from poppler's pdftotext, with the running page header and "Page N of M" removed.
2. For every table, checks each row against the PDF's layout text: the row's cells must sit on
   one printed line, left to right, so no cell has moved column.
Needs poppler (pdftotext, pdfinfo) and node. Exits non-zero if anything is missing or extra.
"""
import difflib
import json
import re
import subprocess
import sys
from collections import Counter

ROOT = __file__.rsplit('/tools/', 1)[0]
RUNNING_HEADERS = {'The Great War — Design Document', 'The Great War Field Manual', 'The Great War: Field Manual'}
LIGATURES = {'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl'}


def norm_tokens(text):
    text = ''.join(LIGATURES.get(c, c) for c in text)
    text = text.replace('​', '').replace(' ', ' ')
    text = re.sub(r'[‘’]', "'", text)
    text = re.sub(r'[“”]', '"', text)
    # pdftotext pads code-font words with spaces: compare without space before punctuation
    text = re.sub(r'\s+([.,:;)])', r'\1', text)
    text = re.sub(r'\(\s+', '(', text)
    # pdftotext drops the hyphen when a hyphenated word breaks across lines (call-to-arms ->
    # call-toarms); the site keeps the word as written, so compare without hyphens
    return [w.replace('-', '') for w in text.split() if w.replace('-', '')]


# the converter leaves out the byline (date and @author), so the comparison does too
BYLINE = re.compile(r'^\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}, \d{4})?\s*(?:\u00b7\s*)?(?:@[^\s@][^@]*)?\s*$')


def is_byline(line):
    line = line.replace('\u200b', '')
    return bool(line.strip()) and bool(BYLINE.match(line)) and bool(re.search(r'\d{4}|@', line))


def pdf_text(pdf, layout=False):
    args = ['pdftotext'] + (['-layout'] if layout else []) + [pdf, '-']
    out = subprocess.run(args, capture_output=True, text=True, check=True).stdout
    keep = []
    for page in out.split('\f'):
        lines = page.split('\n')
        first = next((i for i, l in enumerate(lines) if l.strip()), None)
        # the running header is the first line of every page; the title on page 1 comes after it
        if first is not None and lines[first].strip() in RUNNING_HEADERS:
            lines[first] = ''
        keep += [l for l in lines if not re.fullmatch(r'Page \d+ of \d+', l.strip()) and not is_byline(l)]
    return '\n'.join(keep)


def header_lines(layout, header):
    """How many printed lines carry this header row (more than one when it repeats after a page break)."""
    firsts = [c.split()[0] for c in header if c.strip()]
    n = 0
    for line in layout:
        p, ok = 0, True
        for w in firsts:
            k = line.find(w, p)
            if k < 0:
                ok = False
                break
            p = k + len(w)
        if ok and line.strip().startswith(firsts[0]):
            n += 1
    return n


def rendered(md_path):
    js = ("const w=require(process.argv[1]+'/server/wiki.js');"
          "const d=w.renderFile(process.argv[2]);"
          "process.stdout.write(JSON.stringify({text:d.text,tables:d.tables}))")
    out = subprocess.run(['node', '-e', js, ROOT, md_path], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def main():
    pdf, md = sys.argv[1], sys.argv[2]
    r = rendered(md)
    a = norm_tokens(pdf_text(pdf))
    b = norm_tokens(r['text'])
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    gone, added = Counter(), Counter()
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op != 'equal':
            gone.update(a[i1:i2])
            added.update(b[j1:j2])
    # pdftotext reads some tables column by column, so words can change places; only a word that
    # is missing or extra overall counts. A table header printed again at the top of the next
    # page appears once on the site.
    missing, extra = gone - added, added - gone
    layout = pdf_text(pdf, layout=True).split('\n')
    repeated = 0
    for t in r['tables']:
        extra_copies = header_lines(layout, t['header']) - 1
        if extra_copies > 0:
            repeated += extra_copies
            for _ in range(extra_copies):
                missing -= Counter(w for c in t['header'] for w in norm_tokens(c))
    moved = sum((gone & added).values())
    if missing:
        print('  in the PDF but not on the site:', dict(missing))
    if extra:
        print('  on the site but not in the PDF:', dict(extra))
    print(f'words: PDF {len(a)}, site {len(b)}, missing {sum(missing.values())}, extra {sum(extra.values())}, '
          f'reordered by pdftotext {moved}, repeated page-break headers removed {repeated}')

    bad = 0
    for t in r['tables']:
        for row in [t['header']] + t['rows']:
            cells = [c for c in row if c.strip()]
            firsts = [c.split()[0] for c in cells]
            found = False
            for line in layout:
                p, ok = 0, True
                for w in firsts:
                    k = line.find(w, p)
                    if k < 0:
                        ok = False
                        break
                    p = k + len(w)
                if ok:
                    found = True
                    break
            if not found:
                bad += 1
                print('  table row not found on one printed line:', row)
    print(f'tables: {len(r["tables"])}, columns per table {[len(t["header"]) for t in r["tables"]]}, '
          f'rows {sum(len(t["rows"]) for t in r["tables"])}, rows out of place {bad}')
    sys.exit(1 if missing or extra or bad else 0)


if __name__ == '__main__':
    main()
