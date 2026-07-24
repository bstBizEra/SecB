#!/usr/bin/env python3
from pathlib import Path
import sys, re, json, hashlib
import yaml

ROOT = Path(__file__).resolve().parents[1]
errors=[]
name_re=re.compile(r'^[a-z0-9-]{1,64}$')

for skill_dir in sorted((ROOT/'skills').iterdir()):
    if not skill_dir.is_dir(): continue
    sm=skill_dir/'SKILL.md'; mf=skill_dir/'manifest.yaml'; ev=skill_dir/'evals'/'cases.yaml'
    for required in [sm,mf,ev,skill_dir/'assets'/'output-template.md',skill_dir/'references'/'workflow.md']:
        if not required.exists(): errors.append(f'missing: {required.relative_to(ROOT)}')
    if not sm.exists(): continue
    text=sm.read_text(encoding='utf-8')
    m=re.match(r'^---\n(.*?)\n---\n',text,re.S)
    if not m:
        errors.append(f'frontmatter missing: {sm.relative_to(ROOT)}'); continue
    try: front=yaml.safe_load(m.group(1))
    except Exception as e: errors.append(f'frontmatter yaml: {sm}: {e}'); continue
    name=front.get('name',''); desc=front.get('description','')
    if not name_re.fullmatch(name): errors.append(f'invalid skill name: {name}')
    if name != skill_dir.name: errors.append(f'name/dir mismatch: {skill_dir.name} != {name}')
    if not isinstance(desc,str) or not desc.strip() or len(desc)>1024: errors.append(f'invalid description: {name}')
    if mf.exists():
        try:
            manifest=yaml.safe_load(mf.read_text(encoding='utf-8'))
            if manifest.get('name')!=name: errors.append(f'manifest name mismatch: {name}')
            if manifest.get('classification',{}).get('mutation_class')!='M0': errors.append(f'non-M0 skill in candidate pack: {name}')
            if manifest.get('controls',{}).get('secret_handling')!='prohibited': errors.append(f'secret control missing: {name}')
        except Exception as e: errors.append(f'manifest yaml: {mf}: {e}')
    if ev.exists():
        try:
            cases=yaml.safe_load(ev.read_text(encoding='utf-8'))
            types={x.get('type') for x in cases.get('cases',[])}
            if not {'positive','negative','adversarial','boundary'}.issubset(types): errors.append(f'eval types incomplete: {name}')
        except Exception as e: errors.append(f'eval yaml: {ev}: {e}')

for f in ROOT.rglob('*.yaml'):
    try: yaml.safe_load(f.read_text(encoding='utf-8'))
    except Exception as e: errors.append(f'yaml parse: {f.relative_to(ROOT)}: {e}')
for f in ROOT.rglob('*.json'):
    try: json.loads(f.read_text(encoding='utf-8'))
    except Exception as e: errors.append(f'json parse: {f.relative_to(ROOT)}: {e}')

# Simple secret-pattern scan (avoid flagging policy prose).
patterns=[re.compile(r'AKIA[0-9A-Z]{16}'),re.compile(r'sk-[A-Za-z0-9]{20,}'),re.compile(r'-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----')]
for f in ROOT.rglob('*'):
    if f.is_file() and f.suffix.lower() in {'.md','.yaml','.yml','.json','.py','.ps1','.sh'}:
        txt=f.read_text(encoding='utf-8',errors='ignore')
        for p in patterns:
            if p.search(txt): errors.append(f'possible secret: {f.relative_to(ROOT)}')

if errors:
    print('VALIDATION: FAIL')
    for e in errors: print('-',e)
    sys.exit(1)
print('VALIDATION: PASS')
print('Skills:',len([p for p in (ROOT/'skills').iterdir() if p.is_dir()]))
print('Files:',len([p for p in ROOT.rglob('*') if p.is_file()]))
