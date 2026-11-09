#!/usr/bin/env python3
"""Compare core source against the user-uploaded 2026-11-04 snapshot.

The transmitted text snapshot and original Windows file differ by inconsequential
serialization whitespace in some files, so we accept either documented SHA256.
This is only a file-integrity check; it is not a replacement for `npm test`.
"""
import hashlib
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parent.parent
CHECKS={'src/core/accident.ts': ['d8201f1f1693886d7c8d911eb81c5f65fe8f4bb2d11dc452263923955865c9ea', '664994e7b9c21004116497507f569b473def248b67181786cb1c80bc120493ff'], 'src/core/gameEngine.ts': ['1a746371239b762262ac9bc27c339512c719d79e1df9ed00ad6bb832aee62864', 'f2673129dc873a09358a2b6009405f6ab07a6cb619e081b0d4b61e78f1a09c62'], 'src/core/mapGenerator.ts': ['0fffec55bf5d1acff016907398c25ed0613452311310b72e58129122941d151e', '0fffec55bf5d1acff016907398c25ed0613452311310b72e58129122941d151e'], 'src/core/placement.ts': ['1d872d9ae35f579ad6c4b4bc77ebde0e75e36426804028d8f0fab04eb8dbac79', 'f92f72dbe96bded43fef6744af4dfab3424da3da985fb2b6ca12d9b85e4e0dc2'], 'src/core/rng.ts': ['b9475734bcf8b69192bf5d675ff05e1ba85e481d8b264aa871efe23db3d63259', '2f5f3da120a0d64e1125b52aa9ea20ac2b0114cc492b538f60e3791a95dee7a5'], 'src/core/roadAutotile.ts': ['adb673618f7d15fc24c850910b530d3a64e57c917e2212203fa0c413e928b72a', '0aee28c77fc1d84f0f4a7f6140e3077ca9043fefbfdef4e3a0809546da7da905'], 'src/core/scoring.ts': ['4c935780c4742c94ae5469c6e98eb78ddf00ab8fd13bf86264ff2fbfa1bffeff', '025acf330d5e3d4421aaa9c1e6b87bdbef2fffd5f7777e7441fe673d5112693b'], 'src/core/simulation.ts': ['8c9934056d0c72d0caed40e4e2c800b7a3d1674ad947670765c31a4bf40c70d3', '2a96ce6e04994d1d23f54077b36e98c1a5b2b6893e5befbcf9f7078ac4195d8d'], 'src/core/water.ts': ['d7e33c0fd857b7dd53f9804a2c215d98a5b95cebd8f5a33c596cac4f5927913b', '50b6c938b699fb0758c84d94bd54a723fb8e3ad1ffcd7172a4291757f77c7376'], 'src/core/weather.ts': ['aa68f6d677a8571608e42406a8d47c18b12d3c24dcef4035a246ccb0c693dfaf', 'b74822c1b918f8a52358dd8f63cea983e72977b0f3039b2d5b6a519a10382fd7']}
fail=[]
for filename, allowed in CHECKS.items():
    path=ROOT/filename
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() not in allowed:fail.append(filename)
if fail:
    print('BLOCKED: game core differs from the supplied snapshot:', *fail, sep='\n  ')
    sys.exit(1)
print('PASS: 10 core file hashes match either original bytes or transmitted snapshot bytes.')
