#!/usr/bin/env python3
"""Convert a tagged PDF (the Great War Field Manual / Design Document) into a wiki Markdown file.

Usage:
    pip install pdfminer.six==20240706
    python3 tools/wiki_from_pdf.py "The Great War Field Manual.pdf" content/wiki/player.md
    python3 tools/wiki_from_pdf.py "The Great War — Design Document.pdf" content/wiki/staff.md

The PDFs are exported by Chromium with a full structure tree (headings, lists, tables,
blockquotes), so the structure is read from the tags rather than guessed from layout. Text is
taken character by character from the marked content each tag points at, which keeps the wording
exact and lets line breaks become spaces. Semibold and italic runs inside paragraphs become
**bold** and *italic*.
"""
import re
import sys
from collections import defaultdict

from pdfminer.converter import PDFLayoutAnalyzer
from pdfminer.layout import LAParams, LTChar
from pdfminer.pdfdocument import PDFDocument
from pdfminer.pdfinterp import PDFPageInterpreter, PDFResourceManager
from pdfminer.pdfpage import PDFPage
from pdfminer.pdfparser import PDFParser
from pdfminer.pdftypes import PDFObjRef, resolve1
from pdfminer.psparser import PSLiteral

ZW = '\u200b\u200c\u200d\ufeff'
LIGATURES = {'\ufb00': 'ff', '\ufb01': 'fi', '\ufb02': 'fl', '\ufb03': 'ffi', '\ufb04': 'ffl', '\ufb05': 'st', '\ufb06': 'st'}


def name(x):
    x = resolve1(x)
    if isinstance(x, PSLiteral):
        return x.name if isinstance(x.name, str) else x.name.decode()
    if isinstance(x, bytes):
        return x.decode()
    return x


class Collector(PDFLayoutAnalyzer):
    """Records every glyph with its page, marked-content id, font and position."""

    def __init__(self, rsrcmgr):
        super().__init__(rsrcmgr, pageno=0, laparams=LAParams())
        self.stack = []
        self.chars = defaultdict(list)    # (page_index, mcid) -> [(text, font, x0, y0, size)]
        self.page_index = 0

    def begin_tag(self, tag, props=None):
        mcid = None
        props = resolve1(props) if props is not None else None
        if isinstance(props, dict) and 'MCID' in props:
            mcid = resolve1(props['MCID'])
        self.stack.append(mcid)

    def end_tag(self):
        if self.stack:
            self.stack.pop()

    def current_mcid(self):
        for m in reversed(self.stack):
            if m is not None:
                return m
        return None

    def render_char(self, matrix, font, fontsize, scaling, rise, cid, ncs, graphicstate):
        adv = super().render_char(matrix, font, fontsize, scaling, rise, cid, ncs, graphicstate)
        item = self.cur_item._objs[-1]
        mcid = self.current_mcid()
        if mcid is not None and isinstance(item, LTChar):
            self.chars[(self.page_index, mcid)].append((item.get_text(), item.fontname, item.x0, item.y0, item.size))
        return adv

    def receive_layout(self, ltpage):
        pass


def style_of(font):
    f = font.lower()
    if 'mono' in f:
        return 'code'
    if 'semibold' in f or 'bold' in f:
        return 'bold'
    if 'italic' in f:
        return 'italic'
    return ''


def load(path):
    fp = open(path, 'rb')
    doc = PDFDocument(PDFParser(fp))
    rsrc = PDFResourceManager()
    dev = Collector(rsrc)
    interp = PDFPageInterpreter(rsrc, dev)
    pages = {}
    for i, page in enumerate(PDFPage.create_pages(doc)):
        pages[page.pageid] = i
        dev.page_index = i
        interp.process_page(page)
    return doc, pages, dev.chars


def build_tree(doc, pages):
    root = resolve1(doc.catalog['StructTreeRoot'])
    rolemap = {k: name(v) for k, v in (resolve1(root.get('RoleMap')) or {}).items()}

    def page_of(ref):
        return pages.get(ref.objid) if isinstance(ref, PDFObjRef) else None

    def walk(node, pg):
        node = resolve1(node)
        if isinstance(node, int):
            return [('mc', pg, node)]
        if isinstance(node, list):
            out = []
            for n in node:
                out += walk(n, pg)
            return out
        if not isinstance(node, dict):
            return []
        if name(node.get('Type')) == 'MCR':
            return [('mc', page_of(node.get('Pg')) if node.get('Pg') else pg, resolve1(node['MCID']))]
        if name(node.get('Type')) == 'OBJR':
            return []
        s = name(node.get('S'))
        s = rolemap.get(s, s)
        npg = page_of(node.get('Pg')) if node.get('Pg') is not None else pg
        attrs = {}
        for a in (resolve1(node.get('A')) if isinstance(resolve1(node.get('A')), list) else [node.get('A')]):
            a = resolve1(a)
            if isinstance(a, dict):
                for k, v in a.items():
                    attrs[k] = name(v)
        return [{'s': s, 'attrs': attrs, 'kids': walk(node.get('K'), npg) if node.get('K') is not None else []}]

    return walk(root.get('K'), None)


class Text:
    """Turns an element's marked content into one string, with styled runs."""

    def __init__(self, chars):
        self.chars = chars

    def runs(self, el, allow_style=True, dedupe=False):
        glyphs = []
        seen = set()

        def gather(n):
            if isinstance(n, tuple):
                chunk = self.chars.get((n[1], n[2]), [])
                key = ''.join(g[0] for g in chunk).strip()
                # a table header repeated at the top of the next page points at the same cell twice
                if dedupe and key and key in seen:
                    return
                seen.add(key)
                glyphs.extend(chunk)
                glyphs.append(None)       # marked content boundary
            else:
                for k in n['kids']:
                    gather(k)
        gather(el)
        out = []                          # list of [style, text]
        prev = None
        for g in glyphs:
            if g is None:
                continue
            t, font, x, y, size = g
            t = ''.join(LIGATURES.get(c, c) for c in t if c not in ZW)
            if not t:
                continue
            st = style_of(font) if allow_style else ''
            sep = ''
            if prev is not None:
                px, py, ptxt, psize = prev
                if abs(y - py) > psize * 0.5 and x < px:          # new line
                    if not ptxt.endswith((' ', '-', '—', '–', '/')) and not t.startswith(' '):
                        sep = ' '
            prev = (x, y, t, size)
            if sep:
                if out:
                    out[-1][1] += sep
                else:
                    out.append(['', sep])
            if out and out[-1][0] == st:
                out[-1][1] += t
            else:
                out.append([st, t])
        return out

    def plain(self, el):
        return re.sub(r'[ \t]+', ' ', ''.join(t for _, t in self.runs(el, False))).strip()


MD_SPECIAL = re.compile(r'([\\`*_<>\[\]|])')


def esc(t, in_table=False):
    t = MD_SPECIAL.sub(lambda m: '\\' + m.group(1) if m.group(1) not in '[]' else m.group(1), t)
    if in_table:
        t = t.replace('|', '\\|')
    return t


def md_inline(runs, in_table=False):
    out = ''
    for st, t in runs:
        t = re.sub(r'[ \t]+', ' ', t)
        if not t:
            continue
        if st in ('bold', 'italic', 'code') and t.strip():
            lead = t[:len(t) - len(t.lstrip())]
            trail = t[len(t.rstrip()):]
            core = t.strip()
            if st == 'code':
                core = '`' + core.replace('`', '\\`') + '`'
            else:
                mark = '**' if st == 'bold' else '*'
                core = mark + esc(core, in_table) + mark
            out += lead + core + trail
        else:
            out += esc(t, in_table)
    out = re.sub(r' {2,}', ' ', out).strip()
    # a paragraph that starts like a list item or heading must stay a paragraph
    out = re.sub(r'^(\d+)([.)]) ', r'\1\\\2 ', out)
    out = re.sub(r'^([-+#>]) ', r'\\\1 ', out)
    return out


def render(tree, T):
    lines = []
    headings = []

    def kids(el):
        return [k for k in el['kids'] if isinstance(k, dict)]

    def flat(el):
        """Skip wrapper elements that only hold other elements (NonStruct, Div, Sect, Document...)."""
        res = []
        for k in kids(el):
            if k['s'] in ('NonStruct', 'Div', 'Sect', 'Part', 'Art', 'Document') and any(isinstance(x, dict) for x in k['kids']) and not any(isinstance(x, tuple) for x in k['kids']):
                res += flat(k)
            else:
                res.append(k)
        return res

    def para(el, in_table=False, header=False):
        return md_inline(T.runs(el, dedupe=header), in_table)

    def block(el, indent=''):
        s = el['s']
        if re.fullmatch(r'H[1-6]', s):
            lvl = int(s[1])
            text = T.plain(el)
            headings.append((lvl, text))
            lines.append('')
            lines.append('#' * lvl + ' ' + esc(text))
            lines.append('')
        elif s == 'P':
            t = para(el)
            if t:
                lines.append(indent + t)
                lines.append('' if not indent else indent.rstrip() if False else '')
        elif s == 'L':
            numbering = el['attrs'].get('ListNumbering', 'Disc')
            ordered = numbering in ('Decimal', 'UpperRoman', 'LowerRoman', 'UpperAlpha', 'LowerAlpha')
            n = 0
            for li in flat(el):
                if li['s'] != 'LI':
                    block(li, indent)
                    continue
                n += 1
                marker = f'{n}. ' if ordered else '- '
                body = [k for k in flat(li) if k['s'] == 'LBody'] or [li]
                parts = flat(body[0])
                first = True
                for p in parts:
                    if p['s'] == 'L':
                        lines.append('')
                        block(p, indent + ' ' * len(marker))
                        continue
                    t = para(p)
                    if not t:
                        continue
                    if first:
                        lines.append(indent + marker + t)
                        first = False
                    else:
                        lines.append('')
                        lines.append(indent + ' ' * len(marker) + t)
            lines.append('')
        elif s == 'Table':
            rows = []

            def collect_rows(e):
                for k in flat(e):
                    if k['s'] == 'TR':
                        rows.append(k)
                    elif k['s'] in ('THead', 'TBody', 'TFoot', 'NonStruct'):
                        collect_rows(k)
            collect_rows(el)
            grid = []
            header = None
            for i, tr in enumerate(rows):
                cells = [c for c in flat(tr) if c['s'] in ('TH', 'TD')]
                for c in cells:
                    if c['attrs'].get('ColSpan', 1) not in (1, None) or c['attrs'].get('RowSpan', 1) not in (1, None):
                        raise SystemExit('merged table cells are not supported: ' + T.plain(tr))
                texts = []
                for c in cells:
                    paras = [k for k in flat(c) if k['s'] in ('P', 'NonStruct')] or [c]
                    if any(k['s'] in ('L', 'Table') for k in flat(c)):
                        raise SystemExit('a list or table inside a table cell is not supported: ' + T.plain(c))
                    texts.append('<br>'.join(t for t in (para(p, True, c['s'] == 'TH') for p in paras) if t))
                if i == 0 and all(c['s'] == 'TH' for c in cells):
                    header = texts
                else:
                    grid.append(texts)
            width = max([len(header or [])] + [len(r) for r in grid])
            if header is None:
                raise SystemExit('table without a header row')
            for r in grid:
                if len(r) > width:
                    raise SystemExit(f'table row has {len(r)} cells, header has {width}: {r}')
                r.extend([''] * (width - len(r)))     # the PDF leaves trailing cells blank
            lines.append('')
            lines.append('| ' + ' | '.join(header) + ' |')
            lines.append('|' + '|'.join(['---'] * width) + '|')
            for r in grid:
                lines.append('| ' + ' | '.join(r) + ' |')
            lines.append('')
        elif s == 'BlockQuote':
            inner = [k for k in flat(el)] or [el]
            first = True
            for k in inner:
                if k['s'] == 'P' or not kids(k):
                    t = para(k)
                    if t:
                        if not first:
                            lines.append('>')
                        lines.append('> ' + t)
                        first = False
                else:
                    raise SystemExit('unexpected element inside a blockquote: ' + k['s'])
            lines.append('')
        elif s in ('NonStruct', 'Div', 'Sect', 'Part', 'Art', 'Document', 'Span'):
            if any(isinstance(x, tuple) for x in el['kids']) and not kids(el):
                t = para(el)
                if t:
                    lines.append(indent + t)
                    lines.append('')
            else:
                for k in flat(el) if kids(el) else []:
                    block(k, indent)
        elif s in ('Figure', 'Artifact'):
            pass
        else:
            raise SystemExit('unhandled element: ' + s)

    for top in tree:
        for el in (flat(top) if top['s'] == 'Document' else [top]):
            block(el)
    md = '\n'.join(lines)
    md = re.sub(r'\n{3,}', '\n\n', md).strip() + '\n'
    return md, headings


def main():
    src, dst = sys.argv[1], sys.argv[2]
    doc, pages, chars = load(src)
    tree = build_tree(doc, pages)
    md, headings = render(tree, Text(chars))
    open(dst, 'w', encoding='utf-8').write(md)
    print(f'{dst}: {len(md.splitlines())} lines, {len(headings)} headings')


if __name__ == '__main__':
    main()
