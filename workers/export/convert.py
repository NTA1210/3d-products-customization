from __future__ import annotations

import sys
from pathlib import Path

import trimesh


def main() -> int:
    if len(sys.argv) != 4:
        raise SystemExit("usage: convert.py INPUT.glb OUTPUT FORMAT")
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    file_type = sys.argv[3].lower()
    if file_type not in {"obj", "stl"}:
        raise ValueError(f"unsupported derived export format: {file_type}")

    loaded = trimesh.load(source, force="scene", process=False)
    scene = loaded if isinstance(loaded, trimesh.Scene) else trimesh.Scene(loaded)
    if scene.is_empty:
        raise ValueError("customized GLB contains no exportable geometry")

    # glTF coordinates are meters. OBJ/STL do not carry a reliable unit field,
    # so derived manufacturing formats use the platform canonical millimeter unit.
    scene.apply_scale(1000.0)
    mesh = scene.to_mesh()
    if mesh.is_empty:
        raise ValueError("customized GLB contains no triangle mesh geometry")

    if file_type == "stl":
        payload = mesh.export(file_type="stl")
        output.write_bytes(payload if isinstance(payload, bytes) else payload.encode("utf-8"))
    else:
        payload = trimesh.exchange.obj.export_obj(
            mesh,
            include_normals=True,
            include_color=True,
            include_texture=False,
            header="3D Product Customization export\nUnits: millimeters",
        )
        output.write_text(payload, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
