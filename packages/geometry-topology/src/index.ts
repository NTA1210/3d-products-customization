export const GL_TRIANGLES = 4;

export type Bounds3 = {
  min: [number, number, number];
  max: [number, number, number];
};

export type TriangleRegion = {
  islandIndex: number;
  triangleIndices: number[];
  vertexIndices: number[];
  triangleCount: number;
  vertexCount: number;
  bounds: Bounds3;
};

export type TriangleTopology = {
  triangleCount: number;
  vertexCount: number;
  degenerateTriangleCount: number;
  invalidTriangleCount: number;
  tolerance: number;
  indexed: boolean;
  regions: TriangleRegion[];
};

export type TriangleTopologyInput = {
  positions: ArrayLike<number>;
  positionStride?: number;
  indices?: ArrayLike<number> | null;
  tolerance?: number;
};

function positionAt(positions: ArrayLike<number>, stride: number, index: number) {
  const offset = index * stride;
  return [
    Number(positions[offset] ?? 0),
    Number(positions[offset + 1] ?? 0),
    Number(positions[offset + 2] ?? 0),
  ] as const;
}

function sourceBounds(positions: ArrayLike<number>, stride: number, vertexCount: number): Bounds3 {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < vertexCount; index += 1) {
    const point = positionAt(positions, stride, index);
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min, max };
}

function defaultTolerance(bounds: Bounds3) {
  const dx = bounds.max[0] - bounds.min[0];
  const dy = bounds.max[1] - bounds.min[1];
  const dz = bounds.max[2] - bounds.min[2];
  const diagonal = Math.hypot(dx, dy, dz);
  // glTF linear units are meters. 1e-7 of the model diagonal, with a 0.1 µm floor,
  // is small enough to avoid merging nearby independent parts while reconnecting UV/normal seams.
  return Math.max(diagonal * 1e-7, 1e-7);
}

function cellKey(x: number, y: number, z: number, tolerance: number) {
  return `${Math.floor(x / tolerance)},${Math.floor(y / tolerance)},${Math.floor(z / tolerance)}`;
}

function weldedVertexIds(
  positions: ArrayLike<number>,
  stride: number,
  vertexCount: number,
  tolerance: number,
) {
  const canonical = new Int32Array(vertexCount);
  const representatives: Array<readonly [number, number, number]> = [];
  const buckets = new Map<string, number[]>();
  const toleranceSq = tolerance * tolerance;

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const point = positionAt(positions, stride, vertex);
    const cx = Math.floor(point[0] / tolerance);
    const cy = Math.floor(point[1] / tolerance);
    const cz = Math.floor(point[2] / tolerance);
    let found = -1;

    for (let dx = -1; dx <= 1 && found < 0; dx += 1) {
      for (let dy = -1; dy <= 1 && found < 0; dy += 1) {
        for (let dz = -1; dz <= 1 && found < 0; dz += 1) {
          const list = buckets.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!list) continue;
          for (const candidate of list) {
            const other = representatives[candidate];
            const distanceSq =
              (point[0] - other[0]) ** 2 +
              (point[1] - other[1]) ** 2 +
              (point[2] - other[2]) ** 2;
            if (distanceSq <= toleranceSq) {
              found = candidate;
              break;
            }
          }
        }
      }
    }

    if (found < 0) {
      found = representatives.length;
      representatives.push(point);
      const key = cellKey(point[0], point[1], point[2], tolerance);
      const list = buckets.get(key) ?? [];
      list.push(found);
      buckets.set(key, list);
    }
    canonical[vertex] = found;
  }

  return canonical;
}

function regionBounds(
  positions: ArrayLike<number>,
  stride: number,
  vertices: Iterable<number>,
): Bounds3 {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const vertex of vertices) {
    const point = positionAt(positions, stride, vertex);
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min, max };
}

export function analyzeTriangleTopology(input: TriangleTopologyInput): TriangleTopology {
  const stride = input.positionStride ?? 3;
  if (!Number.isInteger(stride) || stride < 3) {
    throw new Error(`POSITION_STRIDE_INVALID: ${stride}`);
  }

  const vertexCount = Math.floor(input.positions.length / stride);
  const indexed = Boolean(input.indices);
  const elementCount = input.indices?.length ?? vertexCount;
  const triangleCount = Math.floor(elementCount / 3);
  const bounds = sourceBounds(input.positions, stride, vertexCount);
  const tolerance = input.tolerance ?? defaultTolerance(bounds);
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new Error(`TOPOLOGY_TOLERANCE_INVALID: ${tolerance}`);
  }

  const canonical = weldedVertexIds(input.positions, stride, vertexCount, tolerance);
  const parent = new Int32Array(triangleCount);
  for (let index = 0; index < triangleCount; index += 1) parent[index] = index;

  const find = (value: number): number => {
    while (parent[value] !== value) {
      parent[value] = parent[parent[value]];
      value = parent[value];
    }
    return value;
  };
  const union = (left: number, right: number) => {
    left = find(left);
    right = find(right);
    if (left !== right) parent[right] = left;
  };

  const firstTriangleByVertex = new Map<number, number>();
  const rawTriangleVertices: Array<[number, number, number] | null> = [];
  let degenerateTriangleCount = 0;
  let invalidTriangleCount = 0;
  const vertexAt = (element: number) => Number(input.indices ? input.indices[element] : element);

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const raw: [number, number, number] = [
      vertexAt(triangle * 3),
      vertexAt(triangle * 3 + 1),
      vertexAt(triangle * 3 + 2),
    ];
    if (raw.some((vertex) => !Number.isInteger(vertex) || vertex < 0 || vertex >= vertexCount)) {
      invalidTriangleCount += 1;
      rawTriangleVertices.push(null);
      continue;
    }
    rawTriangleVertices.push(raw);
    const welded = raw.map((vertex) => canonical[vertex]);
    if (new Set(welded).size < 3) degenerateTriangleCount += 1;
    for (const vertex of welded) {
      const previous = firstTriangleByVertex.get(vertex);
      if (previous === undefined) firstTriangleByVertex.set(vertex, triangle);
      else union(triangle, previous);
    }
  }

  const groups = new Map<number, number[]>();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    if (!rawTriangleVertices[triangle]) continue;
    const root = find(triangle);
    const group = groups.get(root) ?? [];
    group.push(triangle);
    groups.set(root, group);
  }

  const regions = Array.from(groups.values())
    .sort((left, right) => left[0] - right[0])
    .map((triangleIndices, islandIndex) => {
      const vertices = new Set<number>();
      for (const triangle of triangleIndices) {
        const raw = rawTriangleVertices[triangle];
        if (!raw) continue;
        for (const vertex of raw) vertices.add(vertex);
      }
      return {
        islandIndex,
        triangleIndices,
        vertexIndices: [...vertices].sort((a, b) => a - b),
        triangleCount: triangleIndices.length,
        vertexCount: vertices.size,
        bounds: regionBounds(input.positions, stride, vertices),
      } satisfies TriangleRegion;
    });

  return {
    triangleCount,
    vertexCount,
    degenerateTriangleCount,
    invalidTriangleCount,
    tolerance,
    indexed,
    regions,
  };
}

export type ComponentizationRisk =
  | 'SAFE_SOURCE_PARTS'
  | 'SAFE_REGION_CANDIDATES'
  | 'SINGLE_CONTINUOUS_MESH'
  | 'TOO_MANY_REGIONS'
  | 'UNSUPPORTED_DYNAMIC_GEOMETRY'
  | 'UNSUPPORTED_PRIMITIVE_MODE';

export function classifyComponentization(input: {
  sourceMeshCount: number;
  regionCount: number;
  primitiveMode?: number;
  hasSkin?: boolean;
  hasMorphTargets?: boolean;
  isInstanced?: boolean;
  maxAutoRegions?: number;
}): ComponentizationRisk {
  if (input.hasSkin || input.hasMorphTargets || input.isInstanced) return 'UNSUPPORTED_DYNAMIC_GEOMETRY';
  if ((input.primitiveMode ?? GL_TRIANGLES) !== GL_TRIANGLES) return 'UNSUPPORTED_PRIMITIVE_MODE';
  if (input.sourceMeshCount > 1) return 'SAFE_SOURCE_PARTS';
  if (input.regionCount <= 1) return 'SINGLE_CONTINUOUS_MESH';
  if (input.regionCount > (input.maxAutoRegions ?? 32)) return 'TOO_MANY_REGIONS';
  return 'SAFE_REGION_CANDIDATES';
}
