"""Bounded KN5 validation and adapter for the user's locally installed converter.

No Content Manager binary, keys, model, or third-party converter is distributed
with this repository. All paths below are supplied by the local worker.
"""
import argparse
import importlib.util
import json
import math
import os
from pathlib import Path, PureWindowsPath
import re
import struct
import sys

sys.dont_write_bytecode = True
MAX_FILE = 512 * 1024 * 1024
MAX_VERTICES = 1_000_000
MAX_INDICES = 6_000_000


class InvalidKn5(ValueError):
    pass


class Reader:
    def __init__(self, stream, size):
        self.stream, self.size = stream, size

    def read(self, count):
        if count < 0 or self.stream.tell() + count > self.size:
            raise InvalidKn5('invalid_file')
        data = self.stream.read(count)
        if len(data) != count:
            raise InvalidKn5('invalid_file')
        return data

    def skip(self, count):
        if count < 0 or self.stream.tell() + count > self.size:
            raise InvalidKn5('invalid_file')
        self.stream.seek(count, 1)

    def integer(self):
        return struct.unpack('<i', self.read(4))[0]

    def count(self, maximum):
        count = self.integer()
        if not 0 <= count <= maximum:
            raise InvalidKn5('limit_exceeded')
        return count

    def string(self):
        value = self.read(self.count(1024)).decode('utf-8')
        if any(ord(c) < 32 for c in value):
            raise InvalidKn5('invalid_file')
        return value


def texture_name(value):
    """Reject traversal, Windows ADS/device paths and case-colliding filenames."""
    normalized = value.replace('\\', '/')
    parts = normalized.split('/')
    if (not normalized or PureWindowsPath(value).is_absolute()
            or any(p in ('', '.', '..') or p.endswith((' ', '.')) for p in parts)
            or re.search(r'[:*?"<>|\x00-\x1f]', normalized)
            or any(re.fullmatch(r'(?i:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?', p) for p in parts)):
        raise InvalidKn5('invalid_file')
    return normalized


def inspect_kn5(filename, texture_paths=None):
    """Validate lengths, texture paths, geometry counts and hierarchy before native loading."""
    filename = Path(filename)
    size = filename.stat().st_size
    if not 18 <= size <= MAX_FILE:
        raise InvalidKn5('limit_exceeded')
    textures, references, names = [], [], set()
    vertices = triangles = meshes = placeholder = 0
    with filename.open('rb') as stream:
        reader = Reader(stream, size)
        if reader.read(6) != b'sc6969':
            raise InvalidKn5('invalid_file')
        version = reader.integer()
        if version not in (5, 6):
            raise InvalidKn5('invalid_file')
        if version > 5:
            reader.skip(4)
        for _ in range(reader.count(4096)):
            reader.skip(4)
            name = texture_name(reader.string())
            if name.casefold() in names:
                raise InvalidKn5('invalid_file')
            names.add(name.casefold())
            length = reader.count(MAX_FILE)
            header = reader.read(min(length, 24))
            if header.startswith(b'\x89PNG\r\n\x1a\n') and len(header) >= 24:
                width, height = struct.unpack('>II', header[16:24])
                placeholder += int(width == height == 1)
            elif header.startswith(b'DDS ') and len(header) >= 20:
                height, width = struct.unpack('<II', header[12:20])
                placeholder += int(width == height == 1)
            elif header.startswith(b'\xff\xd8'):
                width = height = 1  # JPEG is validated by the local image reader.
            else:
                raise InvalidKn5('invalid_file')
            if header.startswith((b'DDS ', b'\x89PNG')) and (not 1 <= width <= 16384 or not 1 <= height <= 16384):
                raise InvalidKn5('limit_exceeded')
            reader.skip(length - len(header))
            textures.append(name)
            if texture_paths is not None:
                texture_paths.append(name)
        materials = reader.count(4096)
        for _ in range(materials):
            reader.string(); reader.string(); reader.skip(6)
            for _ in range(reader.count(512)):
                reader.string(); reader.skip(40)
            for _ in range(reader.count(128)):
                kind = reader.string(); reader.skip(4); name = texture_name(reader.string())
                if kind in ('txDiffuse', 'txNormal', 'txDetail'):
                    references.append(name)
        pending = [(1, 0)]
        node_count = 0
        while pending:
            remaining, depth = pending.pop()
            if not remaining:
                continue
            if depth > 64 or node_count > 30000:
                raise InvalidKn5('limit_exceeded')
            pending.append((remaining - 1, depth))
            node_count += 1
            kind = reader.integer(); reader.string(); children = reader.count(30000); reader.skip(1)
            pending.append((children, depth + 1))
            if kind == 1:
                values = struct.unpack('<16f', reader.read(64))
                if not all(math.isfinite(v) and abs(v) < 1e8 for v in values):
                    raise InvalidKn5('invalid_file')
            elif kind in (2, 3):
                reader.skip(3)
                if kind == 3:
                    for _ in range(reader.count(1024)):
                        reader.string(); reader.skip(64)
                count = reader.count(MAX_VERTICES)
                vertices += count; meshes += 1
                if vertices > MAX_VERTICES:
                    raise InvalidKn5('limit_exceeded')
                reader.skip(count * (44 if kind == 2 else 76))
                indices = reader.count(MAX_INDICES)
                if indices % 3 or triangles * 3 + indices > MAX_INDICES:
                    raise InvalidKn5('limit_exceeded')
                triangles += indices // 3
                for (index,) in struct.iter_unpack('<H', reader.read(indices * 2)):
                    if index >= count:
                        raise InvalidKn5('invalid_file')
                material = reader.integer()
                if material < -1 or material >= materials:
                    raise InvalidKn5('invalid_file')
                reader.skip(29 if kind == 2 else 12)
            else:
                raise InvalidKn5('invalid_file')
    if not vertices or not triangles:
        raise InvalidKn5('invalid_file')
    return {'vertices': vertices, 'triangles': triangles, 'meshes': meshes, 'materials': materials,
            'textures': len(textures), 'placeholderTextures': placeholder,
            'missingTextures': sorted(set(name for name in references if name.casefold() not in names))}


def export_model(output, materials, nodes):
    """Stream each triangle once; use the inverse transpose for transformed normals."""
    import numpy as np
    identifiers = [f'm{index}_{re.sub(r"[^a-zA-Z0-9_.-]", "_", material.name)}' for index, material in enumerate(materials)]
    with (output / 'modelo.mtl').open('w', encoding='utf-8') as stream:
        for identifier, material in zip(identifiers, materials):
            stream.write(f'newmtl {identifier}\n')
            for key, value in [('Ka', material.ksAmbient), ('Kd', material.ksDiffuse), ('Ks', material.ksSpecular)]:
                value = max(0, min(1, float(value)))
                stream.write(f'{key} {value} {value} {value}\n')
            stream.write(f'Ns {max(0, min(1000, material.ksSpecularEXP))}\nillum 2\n')
            diffuse = material.txDetail if material.useDetail == 1 and material.txDetail else material.txDiffuse
            if diffuse:
                stream.write(f'map_Kd texture/{texture_name(diffuse)}\n')
                if material.shader in ('ksPerPixelAlpha', 'ksSkidMark', 'ksTree', 'ksGrass', 'ksFlags') or material.shader.startswith('ksPerPixelAT'):
                    stream.write(f'd 0.9999\nmap_d texture/{texture_name(diffuse)}\n')
            if material.txNormal:
                stream.write(f'map_Bump -bm {max(0, min(10, material.normalMult))} texture/{texture_name(material.txNormal)}\n')
            stream.write('\n')
    offset = 0
    with (output / 'modelo.obj').open('w', encoding='utf-8', buffering=1024 * 1024) as stream:
        stream.write('# VJ 3D KN5 conversion\nmtllib modelo.mtl\n')
        for index, node in enumerate(nodes):
            if node.type not in (2, 3) or node.name.startswith('AC_'):
                continue
            stream.write(f'\ng mesh_{index}_{re.sub(r"[^a-zA-Z0-9_.-]", "_", node.name)}\n')
            matrix = np.asarray(node.hmatrix)
            positions = np.asarray(node.position).reshape((-1, 3))
            transformed = np.column_stack((positions, np.ones(len(positions)))) @ matrix
            normal_matrix = np.linalg.pinv(matrix[:3, :3]).T
            normals = np.asarray(node.normal).reshape((-1, 3)) @ normal_matrix
            length = np.linalg.norm(normals, axis=1)
            normals /= np.maximum(length[:, None], 1e-12)
            for values in transformed[:, :3]:
                stream.write('v ' + ' '.join(format(float(value), '.9g') for value in values) + '\n')
            for values in normals:
                stream.write('vn ' + ' '.join(format(float(value), '.9g') for value in values) + '\n')
            multiplier = 1
            if node.materialID >= 0:
                material = materials[node.materialID]
                multiplier = material.detailUVMultiplier if material.useDetail else material.diffuseMult
            for values in np.asarray(node.texture0).reshape((-1, 2)) * multiplier:
                stream.write('vt ' + ' '.join(format(float(value), '.9g') for value in values) + '\n')
            if node.materialID >= 0:
                stream.write(f'usemtl {identifiers[node.materialID]}\n')
            for values in np.asarray(node.indices).reshape((-1, 3)) + offset + 1:
                stream.write('f ' + ' '.join(f'{value}/{value}/{value}' for value in values) + '\n')
            offset += node.vertexCount


def convert(model, output, converter):
    texture_paths = []
    report = inspect_kn5(model, texture_paths)
    if report['missingTextures']:
        raise InvalidKn5('missing_textures')
    if report['textures'] >= 4 and report['placeholderTextures'] == report['textures']:
        raise InvalidKn5('protected_file')
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    for name in texture_paths:
        (output / 'texture' / name).parent.mkdir(parents=True, exist_ok=True)
    spec = importlib.util.spec_from_file_location('installed_kn5_converter', converter)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    _, materials, nodes = module.read_kn5(str(model), str(output))
    export_model(output, materials, nodes)
    # Converter output must not contain invalid coordinates or face references.
    counts = {'v': 0, 'vn': 0, 'vt': 0}
    face_count = 0
    with (output / 'modelo.obj').open() as stream:
        for line in stream:
            fields = line.split()
            if not fields:
                continue
            if fields[0] in counts:
                counts[fields[0]] += 1
                if not all(math.isfinite(float(value)) for value in fields[1:]):
                    raise InvalidKn5('invalid_file')
            elif fields[0] == 'f':
                face_count += 1
                for vertex in fields[1:]:
                    values = vertex.split('/')
                    if len(values) != 3 or any(not 1 <= int(value) <= counts[key] for value, key in zip(values, ('v', 'vt', 'vn'))):
                        raise InvalidKn5('invalid_file')
    if not face_count:
        raise InvalidKn5('invalid_file')
    report.update(vertices=counts['v'], triangles=face_count)
    report.pop('missingTextures', None)
    (output / 'conversao.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    (output / 'LEIA-ME.txt').write_text(
        'VJ 3D — Conversão KN5 para OBJ\n\n'
        'Extraia o ZIP inteiro antes de importar modelo.obj. Mantenha modelo.mtl e a pasta texture juntos.\n'
        'Os materiais são uma aproximação dos shaders do Assetto Corsa. Rig e animações não são preservados.\n'
        'Alguns programas podem precisar que as texturas DDS sejam vinculadas ou convertidas manualmente.\n'
        'A conversão não altera as permissões de uso do modelo original.\n', encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('model'); parser.add_argument('output'); parser.add_argument('converter')
    args = parser.parse_args()
    try:
        convert(Path(args.model), Path(args.output), Path(args.converter))
    except InvalidKn5 as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(2)
    except Exception:
        print('conversion_failed', file=sys.stderr)
        raise SystemExit(3)
