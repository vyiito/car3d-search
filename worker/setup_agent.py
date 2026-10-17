"""Prepare a dedicated profile from the already installed local tools."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import sys
import uuid
import zlib


def storage_text(data):
    if data[0] == 11:  # Content Manager's LZF storage stream.
        data = memoryview(data)[1:]
        output = bytearray(); index = 0
        while index < len(data):
            control = data[index]; index += 1
            if control < 32:
                count = control + 1; output.extend(data[index:index + count]); index += count
            else:
                count = control >> 5
                reference = len(output) - ((control & 31) << 8) - 1
                if count == 7:
                    count += data[index]; index += 1
                reference -= data[index]; index += 1
                for _ in range(count + 2):
                    output.append(output[reference]); reference += 1
            if len(output) > 4 * 1024 * 1024:
                raise ValueError('Unexpected settings size')
        return output.decode('utf-8')
    if data[0] == 0:
        return zlib.decompress(data[1:], -15).decode('utf-8')
    return data.decode('utf-8')


def prepare(pack, destination, config_path, api_url):
    import numpy  # Validate the installed interpreter before advertising availability.
    cm = pack / 'KN5 CONTENT MANAGER C DESCRIPTOGRAFIA/Content Manager.exe'
    converter = pack / 'DummyAC/kn5-obj-converter-main/convert.py'
    if not cm.is_file() or not converter.is_file():
        raise ValueError('Content Manager or KN5 converter not found in the provided pack')
    source_profile = Path(os.environ['LOCALAPPDATA']) / 'AcTools Content Manager'
    if not (source_profile / 'DecryptionKeys.data').is_file():
        raise ValueError('Configure the local Content Manager decryption keys first')
    destination.mkdir(parents=True, exist_ok=True)
    dummy = destination / 'DummyAC'
    for folder in ('apps', 'content/cars', 'system'):
        (dummy / folder).mkdir(parents=True, exist_ok=True)
    for filename in ('acs.exe', 'AssettoCorsa.exe'):
        (dummy / filename).touch(exist_ok=True)
    shutil.copytree(pack / 'DummyAC/system', dummy / 'system', dirs_exist_ok=True)
    profile = destination / 'profile'; profile.mkdir(exist_ok=True)
    for name in ('Centrale.data', 'DecryptionKeys.data'):
        source = source_profile / name
        if source.is_file() and (name != 'Centrale.data' or not (profile / name).exists()):
            shutil.copy2(source, profile / name)
    if (source_profile / 'Plugins').is_dir():
        shutil.copytree(source_profile / 'Plugins', profile / 'Plugins', dirs_exist_ok=True)
    # This bundled Centrale build uses Centrale.data as its main settings store.
    # Never overwrite a profile which CM has already configured successfully.
    settings_name = 'Centrale.data'
    values = storage_text((profile / settings_name).read_bytes())
    if not values.startswith('version: 2'):
        raise ValueError('Unsupported Content Manager settings format')
    escaped = str(dummy.resolve()).replace('\\', '\\\\')
    lines = [line for line in values.splitlines() if not line.startswith('_ac_root\t')]
    # Use CM's LZF envelope even for literal blocks; modified builds may require it.
    encoded = ('\n'.join(lines) + '\n_ac_root\t' + escaped).encode('utf-8')
    envelope = b'\x0b' + b''.join(bytes([len(encoded[i:i + 32]) - 1]) + encoded[i:i + 32] for i in range(0, len(encoded), 32))
    (profile / settings_name).write_bytes(envelope)
    runtime = destination / 'runtime'; runtime.mkdir(exist_ok=True)
    for name in ('agent.py', 'kn5_job.py', 'setup_agent.py'):
        shutil.copy2(Path(__file__).with_name(name), runtime / name)
    existing = json.loads(config_path.read_text(encoding='utf-8-sig')) if config_path.exists() else {}
    # Only unambiguous names from the supplied local catalog can be inferred.
    identities = {}
    for car in (pack / 'DummyAC/content/cars').iterdir():
        if not car.is_dir(): continue
        for model in car.glob('*.kn5'):
            if not model.is_file(): continue
            key = model.name.casefold()
            identities[key] = car.name if key not in identities else None
    config = {**existing, 'apiUrl': api_url, 'workerId': existing.get('workerId', 'windows_' + uuid.uuid4().hex),
              'workRoot': str(destination.resolve()), 'profile': str(profile.resolve()), 'contentManager': str(cm.resolve()),
              'converter': str(converter.resolve()), 'python': sys.executable,
              'knownCarFolders': {key: value for key, value in identities.items() if value}}
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(json.dumps(config, indent=2), encoding='utf-8')
    print('Dedicated converter profile prepared. Credentials were not printed.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--pack', required=True); parser.add_argument('--destination', required=True)
    parser.add_argument('--config', required=True); parser.add_argument('--api-url', required=True)
    args = parser.parse_args()
    prepare(Path(args.pack).resolve(), Path(args.destination).resolve(), Path(args.config).resolve(), args.api_url)
