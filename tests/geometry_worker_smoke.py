import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ANALYZER = ROOT / 'workers' / 'geometry' / 'analyze.py'
FIXTURES = ROOT / 'examples' / 'fixtures'


def analyze(filename: str):
    result = subprocess.run(
        [sys.executable, str(ANALYZER), str(FIXTURES / filename)],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout)
    facts = payload['facts']
    assert facts['vertexCount'] > 0, filename
    assert facts['faceCount'] > 0, filename
    assert facts['geometryCount'] > 0, filename
    assert len(facts['extents']) == 3, filename
    assert len(facts['bounds']) == 2, filename
    return payload


def main():
    proper = analyze('proper-components.glb')
    disconnected = analyze('disconnected-islands.glb')
    continuous = analyze('continuous-mesh.glb')
    multi_material = analyze('multi-material.glb')

    assert disconnected['facts']['bodyCount'] >= 2
    assert any(issue['ruleId'] == 'geometry:multiple-bodies' for issue in disconnected['issues'])
    assert continuous['facts']['bodyCount'] == 1
    assert proper['facts']['faceCount'] > 0
    assert multi_material['facts']['faceCount'] > 0

    print(json.dumps({
        'properBodies': proper['facts']['bodyCount'],
        'disconnectedBodies': disconnected['facts']['bodyCount'],
        'continuousBodies': continuous['facts']['bodyCount'],
        'multiMaterialBodies': multi_material['facts']['bodyCount'],
    }, separators=(',', ':')))


if __name__ == '__main__':
    main()
