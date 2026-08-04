#!/usr/bin/env python3
from pathlib import Path
import sys, re, json, hashlib
import yaml
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
errors=[]
name_re=re.compile(r'^[a-z0-9-]{1,64}$')
skill_manifest_schema=json.loads((ROOT/'schemas'/'skill-manifest.schema.json').read_text(encoding='utf-8'))
skill_manifest_validator=Draft202012Validator(skill_manifest_schema)

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
            for error in sorted(skill_manifest_validator.iter_errors(manifest),key=lambda item:list(item.path)):
                location='.'.join(str(part) for part in error.path) or '<root>'
                errors.append(f'manifest schema: {name}:{location}: {error.message}')
            if manifest.get('name')!=name: errors.append(f'manifest name mismatch: {name}')
            if manifest.get('classification',{}).get('mutation_class')!='M0': errors.append(f'non-M0 skill in candidate pack: {name}')
            if manifest.get('controls',{}).get('secret_handling')!='prohibited': errors.append(f'secret control missing: {name}')
        except Exception as e: errors.append(f'manifest yaml: {mf}: {e}')
    if ev.exists():
        try:
            cases=yaml.safe_load(ev.read_text(encoding='utf-8'))
            types={x.get('type') for x in cases.get('cases',[])}
            if not {'positive','negative','adversarial','boundary'}.issubset(types): errors.append(f'eval types incomplete: {name}')
            if name=='architecture-decision-record':
                counts={kind:sum(1 for item in cases.get('cases',[]) if item.get('type')==kind) for kind in types}
                if counts.get('positive',0)<3: errors.append(f'eval direct/indirect positives incomplete: {name}')
                if counts.get('negative',0)<2: errors.append(f'eval negative triggers incomplete: {name}')
                if counts.get('adversarial',0)<2: errors.append(f'eval adversarial cases incomplete: {name}')
                if counts.get('boundary',0)<2: errors.append(f'eval boundary/incomplete cases incomplete: {name}')
                if counts.get('cross-harness',0)<1: errors.append(f'eval cross-harness case missing: {name}')
        except Exception as e: errors.append(f'eval yaml: {ev}: {e}')

for f in ROOT.rglob('*.yaml'):
    try: yaml.safe_load(f.read_text(encoding='utf-8'))
    except Exception as e: errors.append(f'yaml parse: {f.relative_to(ROOT)}: {e}')
for f in ROOT.rglob('*.json'):
    try: json.loads(f.read_text(encoding='utf-8'))
    except Exception as e: errors.append(f'json parse: {f.relative_to(ROOT)}: {e}')

try:
    adr_schema=json.loads((ROOT/'schemas'/'architecture-decision-record.schema.json').read_text(encoding='utf-8'))
    adr_template=yaml.safe_load((ROOT/'templates'/'architecture-decision-record.yaml').read_text(encoding='utf-8'))
    for error in Draft202012Validator(adr_schema).iter_errors(adr_template):
        location='.'.join(str(part) for part in error.path) or '<root>'
        errors.append(f'architecture decision template schema:{location}: {error.message}')
except Exception as e:
    errors.append(f'architecture decision template validation: {e}')

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
