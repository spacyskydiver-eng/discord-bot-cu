"""arsenal_placeholder.py: writes public/arsenal-placeholder/, a small stand-in for the Arsenal's real content in the
same manifest format the render job writes (mi_work/arsenal/manifest.py), so the viewer can be tried before the real
renders are published:
  hangar/<view>_loop.mp4        dummy loops for home, armoury, tanks and kills
  hangar/move_<a>__<b>.mp4      dummy camera moves; each starts and ends on its two loops' frame 0, like the real ones
  tanks/<tank>/<variant>.webp   dummy transparent stills (+ _thumb.webp)
  vip_plus/kill/<name>.mp4      dummy kill clips
  manifest.json
Needs Pillow and an ffmpeg with libx264 (FFMPEG=/path/to/ffmpeg)."""
import json
import math
import os
import subprocess

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'arsenal-placeholder')
FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')
W, H, FPS = 640, 360, 24
LOOP_S, MOVE_S = 4, 1.0
VIEWS = {'home': (40, 44, 58), 'armoury': (70, 52, 36), 'tanks': (44, 58, 48), 'kills': (66, 38, 40)}
POS = {'armoury': 0, 'home': 1, 'tanks': 2, 'kills': 3}      # left to right across the hangar
FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


def hangar(view, t):
    """a frame of a view's loop at time t (periodic over LOOP_S)"""
    r, g, b = VIEWS[view]
    im = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):                                   # floor and wall
        k = y / H
        d.line([(0, y), (W, y)], fill=(int(r * (0.5 + k)), int(g * (0.5 + k)), int(b * (0.5 + k))))
    for i in range(7):                                   # wooden posts
        x = int(W * (i + 0.5) / 7)
        d.rectangle([x - 6, 0, x + 6, int(H * 0.72)], fill=(int(r * .55), int(g * .5), int(b * .45)))
    d.rectangle([0, int(H * 0.72), W, H], fill=(int(r * .7), int(g * .66), int(b * .6)))
    glow = 0.5 + 0.5 * math.sin(2 * math.pi * t / LOOP_S)  # a lamp flickering with the loop
    d.ellipse([W * .45 - 40, 20, W * .45 + 40, 60], fill=(int(200 + 55 * glow), int(160 + 40 * glow), 90))
    d.text((24, H - 46), f'{view.upper()}  (placeholder)', font=font(22), fill=(235, 225, 200))
    return im


def encode(frames, path, loop=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    p = subprocess.Popen([FFMPEG, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
                          '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '30', '-preset', 'slow', '-movflags', '+faststart', path],
                         stdin=subprocess.PIPE)
    for f in frames:
        p.stdin.write(f.convert('RGB').tobytes())
    p.stdin.close()
    p.wait()


def tank(color, label, accent=None):
    """a transparent stand-in for a tank still, framed on the tanks view"""
    im = Image.new('RGBA', (W * 2, H * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx, cy = W, int(H * 1.18)
    d.ellipse([cx - 330, cy + 120, cx + 330, cy + 170], fill=(0, 0, 0, 110))                  # shadow
    d.rounded_rectangle([cx - 300, cy - 40, cx + 300, cy + 140], 70, fill=(40, 38, 34, 255))  # tracks
    d.polygon([(cx - 260, cy - 10), (cx - 160, cy - 120), (cx + 170, cy - 120), (cx + 270, cy - 10), (cx + 230, cy + 100), (cx - 230, cy + 100)], fill=color + (255,))
    d.rectangle([cx - 90, cy - 190, cx + 90, cy - 120], fill=tuple(int(c * .85) for c in color) + (255,))
    if accent:
        d.ellipse([cx + 60, cy - 60, cx + 140, cy + 20], fill=accent + (255,))
    d.text((cx - 250, cy + 30), label, font=font(34), fill=(245, 240, 225, 255))
    return im


def main():
    os.makedirs(ROOT, exist_ok=True)
    m = {'title': 'Arsenal (placeholder)', 'version': 1, 'frame': {'width': W, 'height': H, 'fps': FPS},
         'notes': 'Placeholder content in the render job\'s manifest format. Replace with the published renders.',
         'views': {}, 'moves': [], 'assets': []}
    n_loop = int(LOOP_S * FPS)
    first = {}
    for v in VIEWS:
        frames = [hangar(v, i / FPS) for i in range(n_loop)]
        first[v] = frames[0]
        encode(frames, f'{ROOT}/hangar/{v}_loop.mp4')
        m['views'][v] = {'title': v.capitalize(), 'description': f'The {v} view (placeholder).', 'loop': f'hangar/{v}_loop.mp4', 'loop_seconds': LOOP_S}
    n_move = int(MOVE_S * FPS) + 1
    for a in VIEWS:
        for b in VIEWS:
            if a == b:
                continue
            dirn = 1 if POS[b] > POS[a] else -1
            frames = []
            for i in range(n_move):
                k = i / (n_move - 1)
                e = k * k * (3 - 2 * k)                        # ease in and out, like a camera move
                fr = Image.new('RGB', (W, H))
                off = int(e * W) * dirn
                fr.paste(first[a], (-off, 0))
                fr.paste(first[b], (dirn * W - off, 0))
                frames.append(fr)
            frames[0], frames[-1] = first[a], first[b]        # exactly the loops' frame 0 at both ends
            encode(frames, f'{ROOT}/hangar/move_{a}__{b}.mp4')
            m['moves'].append({'from': a, 'to': b, 'file': f'hangar/move_{a}__{b}.mp4', 'seconds': MOVE_S})

    TANKS = {
        'mark_v': ('Mark V', (98, 92, 70), [('skins', 'grey_1916', 'Grey 1916', (120, 122, 118)), ('skins', 'solomon_1916', 'Solomon 1916', (150, 130, 90)),
                                            ('flags', 'british_empire', 'British Empire flag', None), ('emblems', 'ace_of_spades_12th_division', 'Ace of spades, 12th Division', None)]),
        'a7v': ('A7V', (92, 98, 92), [('skins', 'buntfarben_1918', 'Buntfarben 1918', (140, 120, 70)), ('flags', 'germany', 'German Empire flag', None)]),
        'fiat_2000': ('Fiat 2000', (110, 112, 84), [('skins', 'tre_toni', 'Tre toni', (150, 120, 80))]),
        'renault_ft': ('Renault FT', (80, 90, 104), [('skins', 'bariole_bleu', 'Bariolé bleu', (90, 110, 140))]),
    }
    CAT = {'skins': 'tank_skin', 'flags': 'tank_flag', 'emblems': 'tank_emblem'}
    for key, (title, color, variants) in TANKS.items():
        items = [('standard', 'default', title, color, None, 'tank', None, f'The {title} in its standard paint (placeholder).')]
        for kind, vk, vt, vc in variants:
            accent = (200, 40, 40) if kind in ('flags', 'emblems') else None
            items.append((kind, vk, f'{title}: {vt}', vc or color, accent, CAT[kind], 'vip', f'{vt} (placeholder).'))
        for kind, vk, t, c, accent, cat, tier, desc in items:
            base = f'tanks/{key}/{kind}/{vk}'
            os.makedirs(os.path.dirname(f'{ROOT}/{base}'), exist_ok=True)
            im = tank(c, t.split(': ')[-1], accent)
            im.save(f'{ROOT}/{base}.webp', 'WEBP', quality=80, method=6)
            th = Image.new('RGB', im.size, (30, 30, 34)); th.paste(im, (0, 0), im)
            th.crop((W // 2, H // 2, W * 3 // 2, H * 3 // 2)).resize((192, 108)).save(f'{ROOT}/{base}_thumb.webp', 'WEBP', quality=75)
            m['assets'].append({'id': f'{key}.{kind}.{vk}', 'title': t, 'category': cat, 'vip_tier': tier, 'tank': key, 'description': desc,
                                'area': 'tanks', 'files': {'transparent': base + '.webp', 'full': None, 'thumbnail': base + '_thumb.webp'}})
    for k, title, kind, desc in [('headshot_back', 'Headshot: straight back', 'instant', 'The head whips back and the body topples backwards (placeholder).'),
                                 ('melee_crumple', 'Melee: crumple', 'slow', 'Struck and crumpling where he stands (placeholder).')]:
        frames = []
        for i in range(int(2 * FPS)):
            fr = hangar('kills', i / FPS)
            d = ImageDraw.Draw(fr)
            k2 = min(1, i / (1.2 * FPS))
            ang = k2 * (90 if kind == 'instant' else 75)
            cx, cy = W // 2, int(H * .72)
            x2, y2 = cx - 90 * math.sin(math.radians(ang)), cy - 90 * math.cos(math.radians(ang))
            d.line([(cx, cy), (x2, y2)], fill=(200, 190, 160), width=10)
            d.ellipse([x2 - 13, y2 - 13, x2 + 13, y2 + 13], fill=(220, 200, 170))
            frames.append(fr)
        encode(frames, f'{ROOT}/vip_plus/kill/{k}.mp4')
        thumb = frames[int(FPS)].crop((W // 4, H // 4, W * 3 // 4, H * 3 // 4)).resize((192, 108))
        thumb.save(f'{ROOT}/vip_plus/kill/{k}_thumb.webp', 'WEBP', quality=75)
        m['assets'].append({'id': f'kill.{k}', 'title': title, 'category': 'kill_animation', 'vip_tier': 'vip_plus', 'kind': kind, 'description': desc,
                            'area': 'kills', 'files': {'full': f'vip_plus/kill/{k}.mp4', 'thumbnail': f'vip_plus/kill/{k}_thumb.webp'}})
    json.dump(m, open(f'{ROOT}/manifest.json', 'w'), indent=1, ensure_ascii=False)
    print(len(m['assets']), 'assets,', len(m['moves']), 'moves')


if __name__ == '__main__':
    main()
