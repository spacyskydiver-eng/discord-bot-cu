"""arsenal_publish.py <stage> <out>: makes the web copy of the Arsenal from the render job's staging folder
(mi_work/arsenal/deliver.py writes ~/arsenal_stage) for upload to the CDN.

  hangar/*.mp4         re-encoded H.264 (CRF 23, faststart) so they start playing before they finish downloading;
                       each loop also gets a poster (<view>_loop.webp, its frame 0) shown while it loads
  tanks/...png         WebP with transparency at 1920 and 960 wide (the viewer picks by screen), thumbnails 320 wide
  vip_plus/kill/*.mp4  re-encoded the same way, with a thumbnail from one second in
  manifest.json        the render job's manifest with the new file names (files.webp, thumbnail_webp, views.*.poster)

Then upload <out> to the bucket under a new version folder, e.g. with rclone and Cloudflare R2:
  rclone copy <out> r2:cue-arsenal/v1 --header-upload "Cache-Control: public, max-age=31536000, immutable"
  rclone copyto <out>/manifest.json r2:cue-arsenal/v1/manifest.json --header-upload "Cache-Control: public, max-age=300"
and set ARSENAL_MANIFEST_URL on Render to https://<bucket domain>/v1/manifest.json. A new set of renders goes in v2,
so nobody is ever served a mix of old and new files.

Needs Pillow and an ffmpeg with libx264 (FFMPEG=/path/to/ffmpeg)."""
import json
import os
import subprocess
import sys

from PIL import Image

FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')


def video(src, dst, poster=None, poster_at=0.0):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', src, '-an', '-c:v', 'libx264', '-crf', '23', '-preset', 'slow',
                    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dst], check=True)
    if poster:
        tmp = poster + '.png'
        subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-ss', str(poster_at), '-i', src, '-frames:v', '1', tmp], check=True)
        im = Image.open(tmp).convert('RGB')
        if 'thumb' in os.path.basename(poster):
            im = im.resize((320, round(im.height * 320 / im.width)), Image.LANCZOS)
        im.save(poster, 'WEBP', quality=80, method=6)
        os.remove(tmp)


def still(src, dst_base):
    """<dst_base>_1920.webp and _960.webp from a PNG; returns their names relative to out"""
    im = Image.open(src)
    out = {}
    for w in (1920, 960):
        r = im if im.width <= w else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        p = f'{dst_base}_{w}.webp'
        r.save(p, 'WEBP', quality=86, method=6)
        out[str(w)] = p
    return out


def main(stage, out):
    m = json.load(open(os.path.join(stage, 'manifest.json')))
    os.makedirs(out, exist_ok=True)
    rel = lambda p: os.path.relpath(p, out)
    S = lambda p: os.path.join(stage, p)
    for v, d in m['views'].items():
        if d.get('loop'):
            dst = os.path.join(out, d['loop'])
            poster = os.path.splitext(dst)[0] + '.webp'
            video(S(d['loop']), dst, poster)
            d['poster'] = rel(poster)
    for mv in m['moves']:
        video(S(mv['file']), os.path.join(out, mv['file']))
    for a in m['assets']:
        f = a['files']
        if a['category'] == 'kill_animation':
            if f.get('full'):
                dst = os.path.join(out, f['full'])
                thumb = os.path.splitext(dst)[0] + '_thumb.webp'
                video(S(f['full']), dst, thumb, 1.0)
                f['thumbnail_webp'] = rel(thumb)
            f.pop('transparent_sequence', None)     # the web uses the clip; the PNG frames stay in the stage
            continue
        for key in ('transparent', 'full'):
            if f.get(key):
                base = os.path.join(out, os.path.splitext(f[key])[0])
                os.makedirs(os.path.dirname(base), exist_ok=True)
                sizes = still(S(f[key]), base)
                if key == 'transparent' or not f.get('webp'):
                    f['webp'] = {w: rel(p) for w, p in sizes.items()}
                f[key] = rel(sizes['1920'])
        if f.get('thumbnail'):
            p = os.path.join(out, os.path.splitext(f['thumbnail'])[0] + '.webp')
            im = Image.open(S(f['thumbnail']))
            im.resize((320, round(im.height * 320 / im.width)), Image.LANCZOS).save(p, 'WEBP', quality=80, method=6)
            f['thumbnail'] = f['thumbnail_webp'] = rel(p)
    json.dump(m, open(os.path.join(out, 'manifest.json'), 'w'), indent=1, ensure_ascii=False)
    size = sum(os.path.getsize(os.path.join(d, x)) for d, _, fs in os.walk(out) for x in fs)
    print(f"{len(m['assets'])} assets, {len(m['moves'])} moves, {size / 1e6:.1f} MB in {out}")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(os.path.expanduser(sys.argv[1]), os.path.expanduser(sys.argv[2]))
