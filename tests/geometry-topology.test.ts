import {describe,expect,it} from 'vitest';
import {analyzeTriangleTopology,classifyComponentization} from '../packages/geometry-topology/src/index';

const cubePositions=[
  -1,-1,-1, 1,-1,-1, 1,1,-1, -1,1,-1,
  -1,-1, 1, 1,-1, 1, 1,1, 1, -1,1, 1,
];
const cubeIndices=[
  0,1,2,0,2,3, 4,6,5,4,7,6,
  0,4,5,0,5,1, 1,5,6,1,6,2,
  2,6,7,2,7,3, 4,0,3,4,3,7,
];

describe('geometry topology',()=>{
  it('detects two disconnected indexed bodies',()=>{
    const positions=[...cubePositions,...cubePositions.map((value,index)=>index%3===0?value+5:value)];
    const indices=[...cubeIndices,...cubeIndices.map(index=>index+8)];
    const result=analyzeTriangleTopology({positions,indices});
    expect(result.regions).toHaveLength(2);
    expect(result.regions.map(region=>region.triangleCount)).toEqual([12,12]);
  });

  it('welds duplicated non-indexed seam vertices by position',()=>{
    // Two triangles forming one square, with every triangle owning independent vertices.
    const positions=[
      0,0,0, 1,0,0, 1,1,0,
      0,0,0, 1,1,0, 0,1,0,
    ];
    const result=analyzeTriangleTopology({positions});
    expect(result.indexed).toBe(false);
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].triangleCount).toBe(2);
  });

  it('keeps nearby but separate parts independent outside tolerance',()=>{
    const positions=[
      0,0,0, 1,0,0, 0,1,0,
      0,0,0.001, 1,0,0.001, 0,1,0.001,
    ];
    const result=analyzeTriangleTopology({positions,tolerance:1e-5});
    expect(result.regions).toHaveLength(2);
  });

  it('reports invalid and degenerate triangles without crashing',()=>{
    const result=analyzeTriangleTopology({
      positions:[0,0,0,1,0,0,0,1,0],
      indices:[0,0,1,0,1,99],
    });
    expect(result.degenerateTriangleCount).toBe(1);
    expect(result.invalidTriangleCount).toBe(1);
  });

  it('classifies safe region fallback and unsafe dynamic cases',()=>{
    expect(classifyComponentization({sourceMeshCount:1,regionCount:7})).toBe('SAFE_REGION_CANDIDATES');
    expect(classifyComponentization({sourceMeshCount:1,regionCount:464})).toBe('TOO_MANY_REGIONS');
    expect(classifyComponentization({sourceMeshCount:1,regionCount:7,hasSkin:true})).toBe('UNSUPPORTED_DYNAMIC_GEOMETRY');
    expect(classifyComponentization({sourceMeshCount:3,regionCount:1})).toBe('SAFE_SOURCE_PARTS');
  });
});
