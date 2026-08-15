import json
import sys

import numpy as np
import trimesh


def finite_vector(values):
    return [float(value) for value in values if np.isfinite(value)]


def main(path: str):
    loaded = trimesh.load(path, force='scene', process=False)
    if not isinstance(loaded, trimesh.Scene):
        loaded = trimesh.Scene(loaded)
    mesh = loaded.to_mesh()
    if mesh is None or len(mesh.vertices) == 0:
        raise RuntimeError('GLB contains no analyzable triangle mesh geometry')

    bodies = mesh.split(only_watertight=False)
    watertight = bool(mesh.is_watertight)
    extents = finite_vector(mesh.extents)
    bounds = [[float(v) for v in row] for row in mesh.bounds]
    facts = {
        'vertexCount': int(len(mesh.vertices)),
        'faceCount': int(len(mesh.faces)),
        'bodyCount': int(len(bodies)),
        'isWatertight': watertight,
        'extents': extents,
        'bounds': bounds,
        'eulerNumber': int(mesh.euler_number),
        'volume': float(mesh.volume) if watertight and np.isfinite(mesh.volume) else None,
        'geometryCount': int(len(loaded.geometry)),
    }

    issues = []
    if not watertight:
        issues.append({
            'id': 'geometry:not-watertight',
            'ruleId': 'geometry:not-watertight',
            'severity': 'WARNING',
            'componentIds': [],
            'message': 'Current exported geometry is not watertight. Volume-based manufacturing checks are therefore not authoritative.',
        })
    if len(bodies) > 1:
        issues.append({
            'id': 'geometry:multiple-bodies',
            'ruleId': 'geometry:multiple-bodies',
            'severity': 'INFO',
            'componentIds': [],
            'message': f'Current exported model contains {len(bodies)} disconnected geometric bodies.',
            'measuredValue': int(len(bodies)),
        })
    print(json.dumps({'facts': facts, 'issues': issues}, separators=(',', ':')))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: analyze.py <model.glb>')
    main(sys.argv[1])
