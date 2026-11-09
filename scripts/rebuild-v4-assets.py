#!/usr/bin/env python3
"""Recreate the offline CC0 pixel-art assets with portable, project-relative SHA manifests.

The output directory may be a temporary directory on any OS. The manifest's
`target` values always describe where files belong inside the game project:
`public/assets/campus/v4/...`; no developer-machine absolute paths are stored.

Requires Python 3 + Pillow only for regeneration; the project ships the PNGs.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile
from PIL import Image, ImageDraw

ASSET_PREFIX = Path('public/assets/campus/v4')
MATRICES = {
    'library': [[81, 82, 85], [124, 125, 130], [362, 282, 364]],
    'teaching': [[135, 136, 137], [124, 128, 130], [363, 365, 364]],
    'canteen': [[43, 44, 45], [70, 71, 72], [205, 282, 211]],
    'shop': [[328, 329, 330], [205, 206, 211], [281, 282, 283]],
    'dormitory': [[108, 109, 113], [178, 179, 184], [362, 363, 364]],
}
PROPS = ['tree', 'bush', 'streetlamp', 'park_bench', 'potted_plant', 'manhole_cover']
TERRAINS = ['grass_1', 'grass_2', 'grass_3', 'sidewalk', 'asphalt', 'asphalt_dashes']
TREE_REMAP = {
    'tree-pine': {(52, 122, 54): (42, 106, 64), (76, 158, 74): (62, 137, 81)},
    'tree-autumn': {(52, 122, 54): (180, 89, 25), (76, 158, 74): (220, 115, 35)},
}
# Tiny 1x1 buildings are authored directly at 16px. A 2x2 building is composed
# from four 16px SOURCE tiles. No 48px sprite is shrunk to 32 or 16 pixels.
BASE_PALETTE = {
    'library': ((58, 100, 123), (219, 202, 148)),
    'teaching': ((76, 122, 108), (225, 216, 173)),
    'canteen': ((166, 86, 58), (227, 192, 141)),
    'shop': ((124, 102, 138), (228, 204, 157)),
    'dormitory': ((128, 96, 78), (219, 204, 177)),
}


def load(source: zipfile.ZipFile, name: str) -> Image.Image:
    try:
        data = source.read(name)
    except KeyError as error:
        raise RuntimeError(f'Missing source PNG inside downloaded ZIP: {name}') from error
    return Image.open(io.BytesIO(data)).convert('RGBA')


def tiny_building(kind: str, appearance: str) -> Image.Image:
    roof, wall = BASE_PALETTE[kind]
    if appearance == 'brick':
        wall = (178, 112, 91)
    elif appearance == 'blue':
        wall = (151, 181, 202)
    im = Image.new('RGBA', (16, 16))
    d = ImageDraw.Draw(im)
    d.rectangle([1, 3, 14, 13], fill=(*wall, 255), outline=(56, 66, 71, 255))
    d.polygon([(0, 5), (3, 1), (12, 1), (15, 5)], fill=(*roof, 255))
    d.line([(3, 3), (12, 3)], fill=(229, 220, 162, 255))
    d.rectangle([3, 7, 5, 9], fill=(170, 217, 231, 255))
    d.rectangle([10, 7, 12, 9], fill=(170, 217, 231, 255))
    d.rectangle([7, 10, 9, 13], fill=(66, 78, 80, 255))
    # 16px building silhouette variant; different color/roof shape per kind.
    if kind == 'library':
        d.rectangle([6, 5, 10, 6], fill=(241, 211, 113, 255))
    elif kind == 'teaching':
        d.rectangle([6, 5, 9, 6], fill=(227, 234, 201, 255))
    elif kind == 'canteen':
        d.rectangle([4, 10, 5, 11], fill=(245, 173, 91, 255))
    elif kind == 'shop':
        d.rectangle([5, 5, 10, 6], fill=(220, 126, 166, 255))
    else:
        d.rectangle([6, 4, 9, 5], fill=(182, 225, 218, 255))
    return im


def medium_building(urban: zipfile.ZipFile, kind: str, appearance: str) -> Image.Image:
    """Compose a native 2x2 façade from 16px source tiles and authored joins.

    No 48px picture is shrunk. Solid wall/roof joins bridge transparent tile
    edges, so the resulting 32px PNG is a complete building, not four shards.
    """
    matrix = MATRICES[kind]
    indices = [[matrix[0][0], matrix[0][2]], [matrix[2][0], matrix[2][2]]]
    roof, wall = BASE_PALETTE[kind]
    if appearance == 'brick':
        wall = (179, 106, 92)
    elif appearance == 'blue':
        wall = (152, 182, 202)
    im = Image.new('RGBA', (32, 32))
    d = ImageDraw.Draw(im)
    d.rectangle([2, 5, 29, 30], fill=(*wall, 255), outline=(60, 70, 70, 255))
    d.rectangle([1, 4, 30, 12], fill=(*roof, 255), outline=(49, 64, 68, 255))
    for y, row in enumerate(indices):
        for x, index in enumerate(row):
            part = load(urban, f'Tiles/tile_{index:04d}.png')
            if part.size != (16, 16):
                raise ValueError(f'{kind}:{index} must be 16x16')
            im.alpha_composite(part, (x * 16, y * 16))
    # Pixel-art fascia across the join: roof, wall, consistent window rhythm.
    d = ImageDraw.Draw(im)
    d.rectangle([1, 12, 30, 14], fill=(*roof, 255))
    d.line([(1, 15), (30, 15)], fill=(67, 76, 76, 255))
    d.rectangle([3, 17, 10, 24], fill=(67, 81, 83, 255))
    d.rectangle([5, 19, 8, 22], fill=(169, 207, 220, 255))
    d.rectangle([21, 17, 28, 24], fill=(67, 81, 83, 255))
    d.rectangle([23, 19, 26, 22], fill=(169, 207, 220, 255))
    d.rectangle([12, 23, 19, 31], fill=(68, 76, 77, 255))
    d.rectangle([13, 24, 18, 30], fill=(115, 141, 133, 255))
    d.rectangle([18, 27, 18, 28], fill=(230, 203, 121, 255))
    accent = {'campus': (225, 200, 124), 'brick': (203, 120, 92), 'blue': (102, 160, 190)}[appearance]
    d.rectangle([10, 9, 21, 11], fill=(*accent, 255))
    return im


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--pulse', required=True, type=Path)
    parser.add_argument('--urban', required=True, type=Path)
    parser.add_argument('--out', type=Path, default=ASSET_PREFIX)
    args = parser.parse_args()
    out = args.out.resolve()
    if not args.pulse.is_file() or not args.urban.is_file():
        raise FileNotFoundError('Provide both original CC0 ZIP files')
    overlays = Path(__file__).resolve().parent / 'v4-overlays'
    records: list[dict] = []

    def save(img: Image.Image, filename: str, origin: str) -> None:
        relative = Path(filename)
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError(f'Invalid asset relative path: {filename}')
        destination = out / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        img.save(destination)
        # The manifest always points into the DESTINATION PROJECT, not the
        # temporary build directory where assets happened to be regenerated.
        records.append({
            'source': origin,
            'target': (ASSET_PREFIX / relative).as_posix(),
            'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
        })

    with zipfile.ZipFile(args.pulse) as pulse, zipfile.ZipFile(args.urban) as urban:
        for mode in ['day', 'night']:
            for name in TERRAINS:
                asset = f'terrain_{mode}/{name}.png'
                save(load(pulse, asset), f'terrain/{mode}-{name}.png', f'Pulse/{asset}')
        for index in range(47):
            asset = f'autotile/road/tile_{index:02d}.png'
            save(load(pulse, asset), f'roads/road-{index:02d}.png', f'Pulse/{asset}')
        for name in PROPS:
            asset = f'props/{name}.png'
            save(load(pulse, asset), f'props/{name}.png', f'Pulse/{asset}')
        raw_tree = load(pulse, 'props/tree.png')
        for variant, mapping in TREE_REMAP.items():
            image = raw_tree.copy()
            image.putdata([(*mapping.get((r, g, b), (r, g, b)), a) for r, g, b, a in image.getdata()])
            save(image, f'props/{variant}.png', 'Pulse/tree.png + declared recolor')
        save(Image.open(overlays / 'flowerbed.png').convert('RGBA'),
             'props/flowerbed.png', 'Project-authored pixel flowerbed')
        for kind, matrix in MATRICES.items():
            full = Image.new('RGBA', (48, 48))
            for y, row in enumerate(matrix):
                for x, index in enumerate(row):
                    part = load(urban, f'Tiles/tile_{index:04d}.png')
                    if part.size != (16, 16):
                        raise ValueError(f'{kind}:{index} must be 16x16')
                    full.paste(part, (x * 16, y * 16))
            full.alpha_composite(Image.open(overlays / f'{kind}.png').convert('RGBA'))
            for appearance in ['campus', 'brick', 'blue']:
                image = full.copy()
                if appearance != 'campus':
                    image.alpha_composite(Image.open(overlays / f'{kind}-{appearance}.png').convert('RGBA'))
                save(image, f'buildings/{kind}-{appearance}-3.png',
                     f'Kenney RPG Urban 3x3 matrix {matrix}; original pixel accent {appearance}')
                save(medium_building(urban, kind, appearance),
                     f'buildings/{kind}-{appearance}-2.png',
                     f'Kenney RPG Urban corners {[[matrix[0][0], matrix[0][2]], [matrix[2][0], matrix[2][2]]]}; 2x2 authored accent')
                save(tiny_building(kind, appearance),
                     f'buildings/{kind}-{appearance}-1.png',
                     'Project-authored 16px tiny building; no fractional scaling')
        for source, name, destination in [
            (pulse, 'LICENSE-CC0.txt', 'LICENSE-Pulse-CC0.txt'),
            (urban, 'License.txt', 'LICENSE-Kenney-RPG-Urban-CC0.txt'),
        ]:
            (out / destination).write_bytes(source.read(name))
    manifest = {
        'manifestFormat': 2,
        'projectRelativeRoot': ASSET_PREFIX.as_posix(),
        'buildings': MATRICES,
        'buildingNativeSizes': {'1': '16x16', '2': '32x32', '3': '48x48'},
        'files': records,
        'license': 'Pulse and Kenney: CC0 1.0; see included license notices',
    }
    (out / 'asset-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Rebuilt {len(records)} portable CC0 assets in {out}.')


if __name__ == '__main__':
    main()
