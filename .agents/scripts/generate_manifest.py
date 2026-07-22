#!/usr/bin/env python3
from pathlib import Path
import hashlib
ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'MANIFEST.sha256'
lines=[]
for f in sorted(ROOT.rglob('*')):
    if not f.is_file() or f==out: continue
    lines.append(f"{hashlib.sha256(f.read_bytes()).hexdigest()}  {f.relative_to(ROOT).as_posix()}")
out.write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(out)
