import argparse
import binascii
import io
import struct
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
import zlib
from kn5_job import inspect_kn5, InvalidKn5, texture_name, export_model


def sample_kn5(texture='paint.png', meshes=1):
    pack = lambda value: struct.pack('<i', value)
    string = lambda value: pack(len(value.encode())) + value.encode()
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', binascii.crc32(kind + data) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2, 2, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress((b'\x00' + bytes([155, 92, 255, 255]) * 2) * 2)) + chunk(b'IEND', b'')
    data = b'sc6969' + pack(6) + pack(0) + pack(1) + pack(1) + string(texture) + pack(len(png)) + png
    data += pack(1) + string('paint') + string('ksPerPixel') + b'\0\0' + pack(0) + pack(0) + pack(1) + string('txDiffuse') + pack(0) + string(texture)
    data += pack(1) + string('root') + pack(meshes) + b'\1' + struct.pack('<16f', 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
    for index in range(meshes):
        data += pack(2) + string('body_' + str(index)) + pack(0) + b'\1' + b'\1\1\1' + pack(3)
        for x, y, u, v in [(0, 0, 0, 0), (1, 0, 1, 0), (0, 1, 0, 1)]:
            data += struct.pack('<11f', x, y, 0, 0, 0, 1, u, v, 1, 0, 0)
        data += pack(3) + struct.pack('<3H', 0, 1, 2) + pack(0) + bytes(29)
    return data


class Kn5Tests(unittest.TestCase):
    def test_valid_sample_and_truncated_or_oversized_sections(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / 'sample.kn5'; source.write_bytes(sample_kn5(meshes=2))
            report = inspect_kn5(source)
            self.assertEqual((report['vertices'], report['triangles'], report['textures']), (6, 2, 1))
            self.assertEqual(report['missingTextures'], [])
            source.write_bytes(source.read_bytes()[:-20])
            with self.assertRaises(InvalidKn5): inspect_kn5(source)
            source.write_bytes(b'sc6969' + struct.pack('<iii', 6, 0, 10000000))
            with self.assertRaises(InvalidKn5): inspect_kn5(source)

    def test_windows_texture_traversal_device_names_and_ads(self):
        for name in ['../escape.png', 'a/../../x', 'C:\\x.dds', '\\\\server\\share\\x', 'file.dds:payload', 'NUL.dds', 'nested/COM1.png', 'trailing./x', '/absolute']:
            with self.subTest(name=name), self.assertRaises(InvalidKn5): texture_name(name)
        self.assertEqual(texture_name('car/interior.PNG'), 'car/interior.PNG')
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / 'unsafe.kn5'; source.write_bytes(sample_kn5('../unsafe.png'))
            with self.assertRaises(InvalidKn5): inspect_kn5(source)

    def test_export_does_not_duplicate_faces_between_meshes_and_transforms_normals(self):
        import numpy as np
        material = SimpleNamespace(name='Paint', ksAmbient=.6, ksDiffuse=.6, ksSpecular=.2, ksSpecularEXP=10, useDetail=0, txDetail='', txDiffuse='paint.png', shader='ksPerPixel', txNormal='', normalMult=1, diffuseMult=1, detailUVMultiplier=1)
        transform = np.diag([2., 1., 1., 1.])
        node = SimpleNamespace(type=2, name='body', hmatrix=transform, position=[0, 0, 0, 1, 0, 0, 0, 1, 0], normal=[1, 1, 0] * 3, materialID=0, texture0=[0, 0, 1, 0, 0, 1], indices=[0, 1, 2], vertexCount=3)
        with tempfile.TemporaryDirectory() as root:
            export_model(Path(root), [material], [node, node])
            lines = (Path(root) / 'modelo.obj').read_text().splitlines()
            faces = [line for line in lines if line.startswith('f ')]
            self.assertEqual(faces, ['f 1/1/1 2/2/2 3/3/3', 'f 4/4/4 5/5/5 6/6/6'])
            normal = next(line for line in lines if line.startswith('vn ')).split()[1:]
            self.assertAlmostEqual(float(normal[1]) / float(normal[0]), 2, places=6)
            self.assertIn('v 2 0 0', lines)
            self.assertIn('map_Kd texture/paint.png', (Path(root) / 'modelo.mtl').read_text())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--sample')
    args, rest = parser.parse_known_args()
    if args.sample:
        Path(args.sample).write_bytes(sample_kn5(meshes=2))
    else:
        unittest.main(argv=['test_kn5.py'] + rest)
