import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NodeIO} from '@gltf-transform/core';
import {analyzeTriangleTopology} from '../packages/geometry-topology/src/index';

async function main(){
  const binary=new Uint8Array(40);
  binary.set([0,1,2],0);
  const values=new Float32Array([0,0,0,1,0,0,0,1,0]);
  binary.set(new Uint8Array(values.buffer),4);
  const uri=`data:application/octet-stream;base64,${Buffer.from(binary).toString('base64')}`;
  const gltf={
    asset:{version:'2.0'},
    scene:0,
    scenes:[{nodes:[0]}],
    nodes:[{mesh:0,name:'Sparse triangle'}],
    meshes:[{primitives:[{attributes:{POSITION:0},mode:4}]}],
    buffers:[{byteLength:40,uri}],
    bufferViews:[
      {buffer:0,byteOffset:0,byteLength:3},
      {buffer:0,byteOffset:4,byteLength:36},
    ],
    accessors:[{
      componentType:5126,
      count:3,
      type:'VEC3',
      sparse:{
        count:3,
        indices:{bufferView:0,componentType:5121},
        values:{bufferView:1},
      },
    }],
  };

  const directory=await mkdtemp(join(tmpdir(),'product3d-sparse-'));
  try{
    const file=join(directory,'sparse.gltf');
    await writeFile(file,JSON.stringify(gltf));
    const document=await new NodeIO().read(file);
    const position=document.getRoot().listMeshes()[0]?.listPrimitives()[0]?.getAttribute('POSITION');
    assert(position?.getArray(),'sparse POSITION must be expanded to an accessor array');
    assert.deepEqual([...position.getArray()!].map(Number),[0,0,0,1,0,0,0,1,0]);
    const topology=analyzeTriangleTopology({positions:position.getArray()!,positionStride:position.getElementSize()});
    assert.equal(topology.triangleCount,1);
    assert.equal(topology.regions.length,1,'expanded sparse triangle must remain one connected region');
    console.log(JSON.stringify({event:'sparse_accessor_smoke',count:position.getCount(),regions:topology.regions.length}));
  }finally{
    await rm(directory,{recursive:true,force:true});
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
