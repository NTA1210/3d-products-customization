import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import validator from 'gltf-validator';
import type {ModelConfiguration,ModelManifest} from '../packages/model-schema/src/index';
import {
  applyTargetTransform,
  prepareComponentTargets,
} from '../workers/export/src/component-targets';

async function main(){
  const here=dirname(fileURLToPath(import.meta.url));
  const fixturePath=resolve(here,'../examples/fixtures/disconnected-islands.glb');
  const sourceBytes=new Uint8Array(await readFile(fixturePath));
  const nodeIo=new NodeIO();
  const document=await nodeIo.readBinary(sourceBytes);

  const sourceNode=document.getRoot().listNodes().find(node=>node.getMesh());
  assert(sourceNode,'fixture must contain a mesh node');
  const sourceNodeIndex=document.getRoot().listNodes().indexOf(sourceNode);
  const sourceMesh=sourceNode.getMesh();
  assert(sourceMesh,'fixture mesh is required');
  const sourceMeshIndex=document.getRoot().listMeshes().indexOf(sourceMesh);
  assert(sourceNodeIndex>=0&&sourceMeshIndex>=0,'fixture IDs must resolve');
  assert.equal(sourceMesh.listPrimitives().length,1,'fixture must have one primitive');

  const baseId=`cmp_node_${String(sourceNodeIndex).padStart(4,'0')}_mesh_${String(sourceMeshIndex).padStart(4,'0')}_prim_00`;
  const regionId=(index:number)=>`${baseId}_region_${String(index).padStart(3,'0')}`;
  const sourceRegionId=(index:number)=>`mesh_${String(sourceMeshIndex).padStart(4,'0')}_prim_00_island_${String(index).padStart(3,'0')}`;

  const manifest:ModelManifest={
    modelId:'mdl_region_export_smoke',
    version:1,
    unit:'mm',
    axisMapping:{width:'x',height:'y',depth:'z'},
    components:[0,1].map(index=>({
      id:regionId(index),
      sourceNodeIds:[`node_${String(sourceNodeIndex).padStart(4,'0')}`],
      sourceMeshIds:[`mesh_${String(sourceMeshIndex).padStart(4,'0')}`],
      sourceRegionIds:[sourceRegionId(index)],
      name:`Region ${index+1}`,
      role:'UNKNOWN' as const,
      editable:true,
      editableAxes:{x:true,y:true,z:true},
      scalingMode:'AXIS_SCALE' as const,
      constraints:{width:null,height:null,depth:null},
      anchorIds:[],
      materialSlotIds:[],
    })),
    dependencies:[],
  };

  const configuration:ModelConfiguration={
    modelId:manifest.modelId,
    manifestVersion:1,
    placement:{locked:true,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}},
    components:{
      [regionId(0)]:{
        originalDimensionsMm:{width:1000,height:1000,depth:1000},
        dimensionsMm:{width:1500,height:1000,depth:1000},
        transform:{position:[100,0,0],rotation:[0,0,0],scale:[1,1,1]},
        visible:true,
        deleted:false,
      },
      [regionId(1)]:{
        originalDimensionsMm:{width:1000,height:1000,depth:1000},
        dimensionsMm:{width:1000,height:800,depth:1000},
        transform:{position:[-50,25,0],rotation:[0,0.1,0],scale:[1,1,1]},
        visible:true,
        deleted:false,
      },
    },
  };

  const originalTriangleCount=sourceMesh.listPrimitives().reduce((sum,primitive)=>{
    const indices=primitive.getIndices();
    const positions=primitive.getAttribute('POSITION');
    const elements=indices?.getCount()??positions?.getCount()??0;
    return sum+Math.floor(elements/3);
  },0);

  const targets=prepareComponentTargets(document,manifest);
  assert.equal(targets.size,2,'two geometry regions must become two export targets');
  for(const definition of manifest.components){
    const target=targets.get(definition.id);
    assert(target,`missing target ${definition.id}`);
    applyTargetTransform(target,manifest,configuration.components[definition.id]);
  }

  const firstTarget=targets.get(regionId(0));
  assert(firstTarget);
  assert(Math.abs(firstTarget.node.getScale()[0]-1.5)<1e-6,'first region width scale must be independent');
  assert(Math.abs((firstTarget.node.getTranslation()[0]-firstTarget.baseTranslation[0])-0.1)<1e-6,'100 mm movement must become 0.1 glTF meter');

  const exported=await nodeIo.writeBinary(document);
  const report=await validator.validateBytes(exported,{uri:'region-export-smoke.glb',format:'glb',maxIssues:5000});
  if(report.issues.numErrors>0){
    console.error(JSON.stringify({
      event:'region_export_validation_failed',
      errors:report.issues.numErrors,
      messages:report.issues.messages.filter(message=>message.severity===0),
    },null,2));
  }
  assert.equal(report.issues.numErrors,0,'exported region GLB must pass glTF validation');

  const reimported=await nodeIo.readBinary(exported);
  const exportedRegionNodes=reimported.getRoot().listNodes().filter(node=>node.getName().endsWith(' Export')&&node.getMesh());
  assert.equal(exportedRegionNodes.length,2,'re-imported GLB must preserve two independently editable region nodes');

  const exportedTriangleCount=exportedRegionNodes.reduce((sum,node)=>{
    const mesh=node.getMesh();
    if(!mesh)return sum;
    return sum+mesh.listPrimitives().reduce((primitiveSum,primitive)=>{
      const indices=primitive.getIndices();
      const positions=primitive.getAttribute('POSITION');
      const elements=indices?.getCount()??positions?.getCount()??0;
      return primitiveSum+Math.floor(elements/3);
    },0);
  },0);
  assert.equal(exportedTriangleCount,originalTriangleCount,'region extraction must preserve all fixture triangles');

  console.log(JSON.stringify({
    event:'region_export_reimport_smoke',
    sourceNodeIndex,
    sourceMeshIndex,
    regionNodes:exportedRegionNodes.length,
    triangles:exportedTriangleCount,
    validationErrors:report.issues.numErrors,
    validationWarnings:report.issues.numWarnings,
  }));
}

main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
