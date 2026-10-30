"""arsenal_publish.py <stage> <out>: makes the web copy of the Arsenal from the render job's staging folder
(the greatwar repo's docs/website/arsenal/, or ~/arsenal_stage) for upload to the CDN.

  hangar/*.mp4         the render job's files unchanged (only made to start playing before they finish downloading);
                       each loop also gets a poster (<view>_loop.webp, its frame 0) shown while it loads
  tanks/...png         WebP with transparency at 1920 and 960 wide (the viewer picks by screen), the tank's colours
                       taken from its full-frame render (see lit()); a full-frame WebP backup, thumbnails 240 wide
  vip_plus/kill/*.mp4  the same, with a thumbnail from one second in
  closeups             a look's closeup.files (its still from the close-up view) converted like the other stills
  manifest.json        the render job's manifest with the new file names (files.webp, thumbnail_webp, views.*.poster)

Then upload it with tools/arsenal_upload.py <out> (Cloudflare R2, bucket cue-arsenal). Re-running both after a
re-render is all a drop-in swap needs: unchanged sources aren't converted again, unchanged files aren't uploaded
again, and every file in the manifest carries ?v=<content hash> so browsers pick up new files under the same names.

Needs Pillow and an ffmpeg with libx264 (FFMPEG=/path/to/ffmpeg)."""
import hashlib
import json
import os
import subprocess
import sys

from PIL import Image, ImageChops, ImageFilter, ImageMath

FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')


def video(src, dst, poster=None, poster_at=0.0):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    # copied exactly as rendered (no re-encode, no rescale: the cobblestone floor must stay frame-for-frame what the
    # render job made, or it shimmers against the stills); only the index moves to the front so playback starts early
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', src, '-an', '-c:v', 'copy', '-movflags', '+faststart', dst], check=True)
    if poster:
        tmp = poster + '.png'
        subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-ss', str(poster_at), '-i', src, '-frames:v', '1', tmp], check=True)
        im = Image.open(tmp).convert('RGB')
        if 'thumb' in os.path.basename(poster):
            im = im.resize((320, round(im.height * 320 / im.width)), Image.LANCZOS)
        im.save(poster, 'WEBP', quality=80, method=6)
        os.remove(tmp)


def lit(src, full, bg):
    """the transparent still with the tank's colours taken from the full-frame render of the same shot. The render
    job's transparent pass comes out darker than its lit full frame (about 30% on the tank), so laid on the loop
    the tank looked dull next to the moves, which are rendered lit. Where the still is mostly opaque the colour is
    solved from full = bg * (1 - a) + colour * a, bg being the loop's frame 0; the soft shadow on the floor keeps
    the transparent pass's own colour. Returns the still unchanged if the three don't line up."""
    im = Image.open(src).convert('RGBA')
    if not (full and bg):
        return im
    F, B = Image.open(full).convert('RGB'), Image.open(bg).convert('RGB')
    if F.size != im.size or B.size != im.size:
        return im
    a = im.getchannel('A')
    solved = [ImageMath.lambda_eval(lambda e: e['float'](e['b']) + (e['float'](e['f']) - e['b']) * 255.0 / e['max'](e['float'](e['a']), 1.0),
                                    f=f, b=b, a=a).convert('L')
              for f, b in zip(F.split(), B.split())]
    body = a.point(lambda v: 255 if v >= 128 else 0)
    rgb = Image.composite(Image.merge('RGB', solved), im.convert('RGB'), body)
    return Image.merge('RGBA', (*rgb.split(), a))


def still(src, dst_base):
    """<dst_base>_1920.webp and _960.webp (with transparency) from a PNG (or an image already open)"""
    im = src if isinstance(src, Image.Image) else Image.open(src)
    out = {}
    for w in (1920, 960):
        r = im if im.width <= w else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        p = f'{dst_base}_{w}.webp'
        r.save(p, 'WEBP', quality=86, method=6)
        out[str(w)] = p
    return out


def swatch(src_png, std_png, frame_png, dst):
    """a close-up for the variant swatch: where this look differs most from the tank's standard paint. A flag or
    an emblem is a small patch, so the swatch zooms in on it; a skin changes the whole hull, so the swatch shows the
    hull. Worked out from the renders, so re-renders need nothing new."""
    im, std = Image.open(src_png).convert('RGBA'), Image.open(std_png).convert('RGBA')
    # only where the tank is (a transparent pixel's hidden colour means nothing); render noise is under 10
    solid = ImageChops.lighter(im.getchannel('A'), std.getchannel('A')).point(lambda a: 255 if a > 200 else 0)
    # the largest change in any colour channel: a repaint can keep the brightness and change only the hue
    r, g, b = ImageChops.difference(im.convert('RGB'), std.convert('RGB')).split()
    d = ImageChops.multiply(ImageChops.lighter(ImageChops.lighter(r, g), b), solid).point(lambda v: 0 if v < 10 else v)
    k = 4
    small = d.resize((d.width // k, d.height // k), Image.BOX).filter(ImageFilter.BoxBlur(1))
    w, h = small.size
    px = small.load()
    best, at = -1, (w // 2, h // 2)
    for y in range(h):
        for x in range(w):
            if px[x, y] > best:
                best, at = px[x, y], (x, y)
    tank = solid.getbbox() or (0, 0, im.width, im.height)      # solid pixels only, not the soft shadow on the floor
    changed = d.resize((d.width // k, d.height // k), Image.BOX).point(lambda v: 255 if v > 6 else 0).histogram()[255]
    area = max(1, (tank[2] - tank[0]) * (tank[3] - tank[1]) // (k * k))
    clear = d.point(lambda v: 255 if v > 25 else 0).histogram()[255]   # pixels clearly changed
    invisible = src_png != std_png and clear < 20             # no visible change at all (it's only render noise)
    if src_png == std_png or invisible or changed / area > 0.2:  # the standard paint or a skin: the whole hull
        cx, cy, side = (tank[0] + tank[2]) // 2, (tank[1] + tank[3]) // 2, int(max(tank[2] - tank[0], tank[3] - tank[1]) * 0.55)
    else:                                                       # a flag or emblem: around the strongest change
        cx, cy, side = at[0] * k + k // 2, at[1] * k + k // 2, 150
    frame = Image.open(frame_png).convert('RGB')
    l, t = max(0, min(frame.width - side, cx - side // 2)), max(0, min(frame.height - side, cy - side // 2))
    frame.crop((l, t, l + side, t + side)).resize((160, 160), Image.LANCZOS).save(dst, 'WEBP', quality=84, method=6)
    return not invisible


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def main(stage, out):
    """Re-running is cheap: a source whose bytes haven't changed since the last run isn't converted again.
    Every file in the written manifest carries ?v=<first 10 hex of its own hash>, so a re-render can keep
    the same names: the address changes with the content and browsers and caches fetch the new file."""
    m = json.load(open(os.path.join(stage, 'manifest.json')))
    os.makedirs(out, exist_ok=True)
    cache_file = os.path.join(out, '.publish-cache.json')
    cache = json.load(open(cache_file)) if os.path.exists(cache_file) else {}
    S = lambda p: os.path.join(stage, p)
    O = lambda p: os.path.join(out, p)
    done = {'converted': 0, 'kept': 0}

    def once(src_rel, outputs, make, sha_of=None):
        """make() writes outputs (paths relative to out) from src_rel, unless the same source made them last time"""
        srcs = sha_of if isinstance(sha_of, list) else [sha_of or src_rel]
        h = '+'.join(sha(x if os.path.isabs(x) else S(x)) for x in srcs if x)
        if cache.get(src_rel) == h and all(os.path.exists(O(x)) for x in outputs):
            done['kept'] += 1
            return
        for x in outputs:
            os.makedirs(os.path.dirname(O(x)), exist_ok=True)
        make()
        cache[src_rel] = h
        done['converted'] += 1

    def ver(p):
        return f'{p}?v={sha(O(p))[:10]}'

    stem = lambda p: os.path.splitext(p)[0]
    bg = {}     # each view's loop frame 0 (not uploaded), what its transparent stills are laid on
    for v, d in m['views'].items():
        if d.get('loop'):
            src, poster = d['loop'], stem(d['loop']) + '.webp'
            once(src, [src, poster], lambda: video(S(src), O(src), O(poster)))
            bg[v] = os.path.abspath(O(f'.frame0_{v}.png'))
            once(src + '#frame0', [bg[v]], lambda: subprocess.run(
                [FFMPEG, '-y', '-loglevel', 'error', '-i', S(src), '-frames:v', '1', bg[v]], check=True), sha_of=src)
            d['loop'], d['poster'] = ver(src), ver(poster)
    for mv in m['moves']:
        src = mv['file']
        once(src, [src], lambda: video(S(src), O(src)))
        mv['file'] = ver(src)
    orig = {a['id']: a['files'].get('transparent') for a in m['assets'] if a['files'].get('transparent')}
    orig_full = {a['id']: a['files'].get('full') for a in m['assets'] if a['files'].get('full') and a['category'] != 'kill_animation'}
    keep, unseen = [], []
    for a in m['assets']:
        f = a['files']
        if a['category'] == 'kill_animation':
            # the web plays the full-frame clip; a kill whose clip isn't delivered yet is left out until it is
            if not f.get('full'):
                continue
            src, thumb = f['full'], stem(f['full']) + '_thumb.webp'
            once(src, [src, thumb], lambda: video(S(src), O(src), O(thumb), 1.0))
            f['full'], f['thumbnail_webp'] = ver(src), ver(thumb)
            f.pop('transparent_sequence', None)
            f.pop('frames', None)
            keep.append(a)
            continue
        if f.get('transparent'):
            src, fsrc, b = f['transparent'], f.get('full'), bg.get(a.get('area'))
            sizes = {w: f'{stem(src)}_{w}.webp' for w in ('1920', '960')}
            once(src, list(sizes.values()), lambda: still(lit(S(src), fsrc and S(fsrc), b), O(stem(src))), sha_of=[src, fsrc, b])
            f['webp'] = {w: ver(x) for w, x in sizes.items()}
            f['transparent'] = f['webp']['1920']
        if f.get('full'):
            src, dst = f['full'], stem(f['full']) + '.webp'
            def full():
                Image.open(S(src)).convert('RGB').save(O(dst), 'WEBP', quality=84, method=6)
            once(src, [dst], full)
            f['full'] = ver(dst)
        cf = (a.get('closeup') or {}).get('files') or {}
        cfull_src, cbg = cf.get('full'), bg.get((a.get('closeup') or {}).get('view'))
        for key in ('transparent', 'full'):
            if cf.get(key):
                src = cf[key]
                if key == 'transparent':
                    sizes = {w: f'{stem(src)}_{w}.webp' for w in ('1920', '960')}
                    once(src, list(sizes.values()), lambda: still(lit(S(src), cfull_src and S(cfull_src), cbg), O(stem(src))),
                         sha_of=[src, cfull_src, cbg])
                    cf['webp'] = {w: ver(x) for w, x in sizes.items()}
                    cf['transparent'] = cf['webp']['1920']
                else:
                    dst = stem(src) + '.webp'
                    def cfull():
                        Image.open(S(src)).convert('RGB').save(O(dst), 'WEBP', quality=84, method=6)
                    once(src, [dst], cfull)
                    cf['full'] = ver(dst)
        std = next((x for x in m['assets'] if x.get('tank') and x.get('tank') == a.get('tank') and x['category'] == 'tank'), None)
        if std and a['files'].get('transparent') and orig.get(std['id']):
            src, dst = orig[a['id']], stem(orig[a['id']]) + '_swatch.webp'
            frame = orig_full.get(a['id']) or src
            def sw():
                if not swatch(S(src), S(orig[std['id']]), S(frame), O(dst)):
                    unseen.append(a['id'])
            once(src + '#swatch', [dst], sw, sha_of=src)
            f['swatch'] = ver(dst)
        if f.get('thumbnail'):
            src, dst = f['thumbnail'], stem(f['thumbnail']) + '.webp'
            def thumb():
                im = Image.open(S(src))
                im.resize((240, round(im.height * 240 / im.width)), Image.LANCZOS).save(O(dst), 'WEBP', quality=82, method=6)
            once(src, [dst], thumb)
            f['thumbnail'] = f['thumbnail_webp'] = ver(dst)
        keep.append(a)
    m['assets'] = keep
    json.dump(m, open(O('manifest.json'), 'w'), indent=1, ensure_ascii=False)
    json.dump(cache, open(cache_file, 'w'), indent=1)
    size = sum(os.path.getsize(os.path.join(d, x)) for d, _, fs in os.walk(out) for x in fs if not x.startswith('.'))
    print(f"{len(m['assets'])} assets, {len(m['moves'])} moves, {size / 1e6:.1f} MB in {out} "
          f"({done['converted']} converted, {done['kept']} unchanged)")
    if unseen:
        print(f'WARNING: {len(unseen)} look(s) show no visible difference from their tank\'s standard paint in this camera:',
              ', '.join(unseen))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(os.path.expanduser(sys.argv[1]), os.path.expanduser(sys.argv[2]))
