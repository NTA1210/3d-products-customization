import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  flattenComponentObjects,
  hasNestedComponentObjects,
} from '../apps/web/lib/component-scene';

function worldPosition(object: THREE.Object3D) {
  object.updateWorldMatrix(true, false);
  return object.getWorldPosition(new THREE.Vector3());
}

describe('editor component scene isolation', () => {
  it('preserves initial world transforms and prevents parent movement from moving child components', () => {
    const root = new THREE.Group();
    root.position.set(4, -2, 1);

    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    body.position.set(3, 0, 0);
    body.rotation.set(0, Math.PI / 6, 0);

    const wing = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 4));
    wing.position.set(0, 2, -1);

    root.add(body);
    body.add(wing);
    root.updateMatrixWorld(true);

    const bodyBefore = worldPosition(body).clone();
    const wingBefore = worldPosition(wing).clone();

    const components = [
      { id: 'body', object: body },
      { id: 'wing', object: wing },
    ];

    const layer = flattenComponentObjects(root, components);

    expect(body.parent).toBe(layer);
    expect(wing.parent).toBe(layer);
    expect(hasNestedComponentObjects(components)).toBe(false);
    expect(worldPosition(body).distanceTo(bodyBefore)).toBeLessThan(1e-6);
    expect(worldPosition(wing).distanceTo(wingBefore)).toBeLessThan(1e-6);

    body.position.x += 5;
    root.updateMatrixWorld(true);

    expect(worldPosition(body).distanceTo(bodyBefore)).toBeGreaterThan(4.9);
    expect(worldPosition(wing).distanceTo(wingBefore)).toBeLessThan(1e-6);
  });
});
