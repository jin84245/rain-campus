#!/usr/bin/env python3
"""Validate the shipped portable V4 assets and manifest without external packages."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import struct
import sys

root = Path(__file__).resolve().parent.parent
asset_dir = root / 'public/assets/campus/v4'
manifest = json.loads((asset_dir / 'asset-manifest.json').read_text(encoding='utf-8'))
seen: set[str] = set()
errors: list[str] = []
for item in manifest['files']:
    raw_target = item['target'].replace('\\', '/')
    rel = Path(raw_target)
    if rel.is_absolute() or '..' in rel.parts or raw_target.startswith('/') or ':' in raw_target:
        errors.append(f'nonportable asset path: {raw_target}')
        continue
    if not raw_target.startswith('public/assets/campus/v4/'):
        errors.append(f'asset outside expected public root: {raw_target}')
        continue
    path = root / rel
    if raw_target in seen:
        errors.append(f'duplicate manifest entry: {raw_target}')
    seen.add(raw_target)
    if not path.is_file():
        errors.append(f'missing asset: {raw_target}')
        continue
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != item['sha256']:
        errors.append(f'bad checksum: {raw_target}')
    if not data.startswith(b'\x89PNG\r\n\x1a\n'):
        errors.append(f'not a PNG: {raw_target}')
        continue
    width, height = struct.unpack('>II', data[16:24])
    folder = path.parent.name
    if folder in ('roads', 'terrain', 'props') and (width, height) != (16, 16):
        errors.append(f'incorrect size {width}x{height}: {raw_target}')
    if folder == 'buildings':
        try:
            size = int(path.stem.rsplit('-', 1)[-1])
        except ValueError:
            errors.append(f'building has no -1/-2/-3 size suffix: {raw_target}')
            continue
        if size not in (1, 2, 3) or (width, height) != (16 * size, 16 * size):
            errors.append(f'incorrect building source size: {raw_target} ({width}x{height})')
for notice in ('LICENSE-Pulse-CC0.txt', 'LICENSE-Kenney-RPG-Urban-CC0.txt'):
    if not (asset_dir / notice).is_file():
        errors.append(f'missing CC0 notice: {notice}')
if errors:
    print('\n'.join('ERROR: ' + error for error in errors), file=sys.stderr)
    sys.exit(1)
print(f'PASS: {len(seen)} portable PNG references verified (SHA256, dimensions, licenses).')
