import * as THREE from 'three';

export type RuntimeComponentObject = {
  id: string;
  object: THREE.Object3D;
};

const COMPONENT_LAYER_FLAG = '__editorComponentLayer';

/**
 * GLB nodes are allowed to be nested, but editor components must not inherit
 * transforms from other editor components. This function preserves every
 * component's current world transform while re-parenting the component
 * objects beneath one neutral sibling layer.
 */
export function flattenComponentObjects(
  root: THREE.Object3D,
  components: RuntimeComponentObject[],
): THREE.Group {
  root.updateMatrixWorld(true);

  // Capture every world matrix before detaching anything. This makes the
  // operation safe even when component A is an ancestor of component B.
  const snapshots = components.map(({ id, object }) => ({
    id,
    object,
    worldMatrix: object.matrixWorld.clone(),
  }));

  const existingLayer = root.children.find(
    (child) => child instanceof THREE.Group && child.userData[COMPONENT_LAYER_FLAG] === true,
  );
  const layer = existingLayer instanceof THREE.Group ? existingLayer : new THREE.Group();

  if (!existingLayer) {
    layer.name = 'Editor Component Layer';
    layer.userData[COMPONENT_LAYER_FLAG] = true;
    root.add(layer);
  }

  root.updateMatrixWorld(true);
  layer.updateWorldMatrix(true, false);
  const inverseLayerWorld = layer.matrixWorld.clone().invert();

  for (const snapshot of snapshots) {
    const { object, worldMatrix, id } = snapshot;
    object.removeFromParent();
    layer.add(object);

    const localMatrix = new THREE.Matrix4().multiplyMatrices(inverseLayerWorld, worldMatrix);
    localMatrix.decompose(object.position, object.quaternion, object.scale);
    object.updateMatrix();
    object.matrixWorldNeedsUpdate = true;
    object.userData.__componentId = id;
  }

  layer.updateMatrixWorld(true);
  return layer;
}

export function hasNestedComponentObjects(components: RuntimeComponentObject[]): boolean {
  const objects = new Set(components.map((component) => component.object));
  for (const component of components) {
    let current = component.object.parent;
    while (current) {
      if (objects.has(current)) return true;
      current = current.parent;
    }
  }
  return false;
}
