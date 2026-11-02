#!/usr/bin/env python3
"""Unpack the versioned research site and apply its editable interface files."""
import hashlib
import io
import json
import shutil
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = ROOT / 'dist'
manifest = json.loads((HERE / 'payload.json').read_text())
chunks = []
for entry in manifest['parts']:
    content = (HERE / 'payload' / entry['file']).read_bytes()
    if len(content) != entry['bytes'] or hashlib.sha256(content).hexdigest() != entry['sha256']:
        raise ValueError('Payload integrity check failed: ' + entry['file'])
    chunks.append(content)
payload = b''.join(chunks)
if hashlib.sha256(payload).hexdigest() != manifest['archive_sha256']:
    raise ValueError('Archive checksum mismatch')
if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir()
with tarfile.open(fileobj=io.BytesIO(payload), mode='r:gz') as archive:
    for member in archive.getmembers():
        path = Path(member.name)
        if path.is_absolute() or '..' in path.parts or not member.isfile():
            raise ValueError('Unexpected archive entry: ' + member.name)
        dest = OUT / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(archive.extractfile(member).read())
for name, destination in [('home', OUT), ('shared', OUT / 'shared'), ('geometry', OUT / 'dashboards/geometry')]:
    source = HERE / name
    if source.exists():
        for file in source.rglob('*'):
            if file.is_file():
                target = destination / file.relative_to(source)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(file, target)
# The two original Pages builds concatenate BASE_URL and '/data'. Repair the
# suffix in the preserved payload without rewriting the large research archive.
for slug, expected in [('decay', 2), ('b1', 1)]:
    changed = 0
    for script in (OUT / 'dashboards' / slug / 'assets').glob('*.js'):
        content = script.read_text()
        changed += content.count('+"./data"')
        script.write_text(content.replace('+"./data"', '+"/data"'))
    if changed not in (0, expected):
        raise ValueError('Unexpected base-path patch count for ' + slug)
for slug in ['grammar', 'physics', 'decay', 'b1', 'latent', 'geometry']:
    if not (OUT / 'dashboards' / slug / 'index.html').is_file():
        raise ValueError('Missing dashboard: ' + slug)
print('Research hub built with all six dashboard routes.')
