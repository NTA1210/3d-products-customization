"""Blender-backed derived export from an already-customized GLB.

Usage:
  blender --background --python blender_convert.py -- INPUT OUTPUT FORMAT

FORMAT: gltf | fbx | usdz
"""
from __future__ import annotations

import os
import sys

import bpy


def args() -> tuple[str, str, str]:
    if "--" not in sys.argv:
        raise RuntimeError("Expected arguments after --")
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 3:
        raise RuntimeError("Usage: blender ... -- INPUT OUTPUT FORMAT")
    source, output, fmt = values
    return os.path.abspath(source), os.path.abspath(output), fmt.lower()


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def main() -> None:
    source, output, fmt = args()
    if fmt not in {"gltf", "fbx", "usdz"}:
        raise RuntimeError(f"Unsupported Blender export format: {fmt}")
    clear_scene()
    result = bpy.ops.import_scene.gltf(filepath=source)
    if "FINISHED" not in result:
        raise RuntimeError(f"Could not import customized GLB: {result}")
    os.makedirs(os.path.dirname(output), exist_ok=True)

    if fmt == "gltf":
        result = bpy.ops.export_scene.gltf(
            filepath=output,
            export_format="GLTF_EMBEDDED",
            export_apply=True,
        )
    elif fmt == "fbx":
        result = bpy.ops.export_scene.fbx(
            filepath=output,
            use_selection=False,
            path_mode="COPY",
            embed_textures=True,
            apply_unit_scale=True,
            bake_space_transform=False,
        )
    else:
        # Blender packages USDZ automatically when the destination extension is .usdz.
        result = bpy.ops.wm.usd_export(filepath=output, export_materials=True)

    if "FINISHED" not in result:
        raise RuntimeError(f"Blender {fmt} export failed: {result}")
    if not os.path.isfile(output) or os.path.getsize(output) == 0:
        raise RuntimeError(f"Blender {fmt} export produced no artifact")
    print(f"exported={output} format={fmt} bytes={os.path.getsize(output)}")


if __name__ == "__main__":
    main()
