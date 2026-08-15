import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


def args():
    raw = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--mode', choices=['MULTI_VIEW', 'SPIN_360'], required=True)
    parser.add_argument('--quality', choices=['DRAFT', 'STANDARD', 'HIGH'], default='STANDARD')
    parser.add_argument('--frames', type=int, default=36)
    return parser.parse_args(raw)


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)


def bounds():
    points = []
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not points:
        raise RuntimeError('Imported GLB contains no mesh objects')
    min_v = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    max_v = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return (min_v + max_v) / 2, max((max_v - min_v).length, 0.1)


def look_at(camera, target):
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()


def configure_scene(quality):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    sizes = {'DRAFT': 512, 'STANDARD': 1024, 'HIGH': 1600}
    samples = {'DRAFT': 16, 'STANDARD': 32, 'HIGH': 64}
    scene.render.resolution_x = sizes[quality]
    scene.render.resolution_y = sizes[quality]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.image_settings.color_depth = '8'
    if hasattr(scene, 'eevee'):
        scene.eevee.taa_render_samples = samples[quality]
    world = bpy.data.worlds.new('Product World') if not bpy.data.worlds else bpy.data.worlds[0]
    scene.world = world
    world.color = (0.055, 0.065, 0.08)


def add_lights(center, radius):
    for name, pos, energy, size in [
        ('Key', (radius * 1.8, -radius * 1.5, radius * 2.2), 1000, radius),
        ('Fill', (-radius * 1.4, -radius * 0.8, radius * 1.2), 650, radius * 1.2),
        ('Rim', (0, radius * 1.8, radius * 1.8), 850, radius * 0.8),
    ]:
        data = bpy.data.lights.new(name=name, type='AREA')
        data.energy = energy
        data.shape = 'DISK'
        data.size = max(size, 1.0)
        obj = bpy.data.objects.new(name, data)
        obj.location = Vector(pos) + center
        bpy.context.collection.objects.link(obj)
        look_at(obj, center)


def add_camera(center, radius):
    data = bpy.data.cameras.new('Render Camera')
    data.lens = 52
    camera = bpy.data.objects.new('Render Camera', data)
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    return camera


def render_at(camera, center, position, path):
    camera.location = center + Vector(position)
    look_at(camera, center)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    cfg = args()
    os.makedirs(cfg.output, exist_ok=True)
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=cfg.input)
    configure_scene(cfg.quality)
    center, diameter = bounds()
    radius = max(diameter * 1.35, 2.0)
    add_lights(center, radius)
    camera = add_camera(center, radius)

    if cfg.mode == 'MULTI_VIEW':
        views = {
            'front': (0, -radius, radius * 0.35),
            'back': (0, radius, radius * 0.35),
            'left': (-radius, 0, radius * 0.35),
            'right': (radius, 0, radius * 0.35),
            'top': (0, 0, radius * 1.15),
            'perspective': (radius * 0.75, -radius * 0.75, radius * 0.55),
        }
        for name, position in views.items():
            render_at(camera, center, position, os.path.join(cfg.output, f'{name}.png'))
    else:
        frames = max(12, min(cfg.frames, 120))
        for index in range(frames):
            angle = 2 * math.pi * index / frames
            position = (math.cos(angle) * radius, math.sin(angle) * radius, radius * 0.35)
            render_at(camera, center, position, os.path.join(cfg.output, f'frame-{index:03d}.png'))


if __name__ == '__main__':
    main()
