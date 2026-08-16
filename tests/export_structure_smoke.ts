import assert from 'node:assert/strict';
import {Document,NodeIO} from '@gltf-transform/core';
import validator from 'gltf-validator';
import type {ModelConfiguration,ModelManifest} from '../packages/model-schema/src/index';
import {applyTargetTransform,prepareComponentTargets} from '../workers/export/src/component-targets';

function trianglePrimitive(document:Document,offsetX=0){
  const buffer=document.getRoot().listBuffers()[0]??document.createBuffer();
  const positions=document.createAccessor().setType('VEC3').setArray(new Float32Array([
    offsetX,0,0,
    offsetX+1,0,0,
    offsetX,1,0,
  ])).setBuffer(buffer);
  return document.createPrimitive().setAttribute('POSITION',positions);
}

function state(position:[number,number,number]):ModelConfiguration['components'][string]{
  return{
    originalDimensionsMm:{width:1000,height:1000,depth:1000},
    dimensionsMm:{width:1000,height:1000,depth:1000},
    transform:{position,rotation:[0,0,0],scale:[1,1,1]},
    visible:true,
    deleted:false,
  };
}

function component(id:string,node:number,mesh:number,primitive:number,name:string):ModelManifest['components'][number]{
  return{
    id,
    sourceNodeIds:[`node_${String(node).padStart(4,'0')}`],
    sourceMeshIds:[`mesh_${String(mesh).padStart(4,'0')}`],
    name,
    role:'UNKNOWN',
    editable:true,
    editableAxes:{x:true,y:true,z:true},
    scalingMode:'AXIS_SCALE',
    constraints:{width:null,height:null,depth:null},
    anchorIds:[],
    materialSlotIds:[],
  };
}

async function validateRoundTrip(document:Document,label:string){
  const io=new NodeIO();
  const bytes=await io.writeBinary(document);
  const report=await validator.validateBytes(bytes,{uri:`${label}.glb`,format:'glb',maxIssues:5000});
  if(report.issues.numErrors){
    console.error(JSON.stringify(report.issues.messages.filter(message=>message.severity===0),null,2));
  }
  assert.equal(report.issues.numErrors,0,`${label} must pass glTF validation`);
  return io.readBinary(bytes);
}

async function sharedMeshCase(){
  const document=new Document();
  const mesh=document.createMesh('Shared Mesh').addPrimitive(trianglePrimitive(document));
  const first=document.createNode('Instance A').setMesh(mesh);
  const second=document.createNode('Instance B').setMesh(mesh).setTranslation([2,0,0]);
  document.createScene('Product').addChild(first).addChild(second);
  document.getRoot().setDefaultScene(document.getRoot().listScenes()[0]);

  const nodes=document.getRoot().listNodes();
  const meshes=document.getRoot().listMeshes();
  const firstNode=nodes.indexOf(first),secondNode=nodes.indexOf(second),meshIndex=meshes.indexOf(mesh);
  const idA=`cmp_node_${String(firstNode).padStart(4,'0')}_mesh_${String(meshIndex).padStart(4,'0')}_prim_00`;
  const idB=`cmp_node_${String(secondNode).padStart(4,'0')}_mesh_${String(meshIndex).padStart(4,'0')}_prim_00`;
  const manifest:ModelManifest={modelId:'shared',version:1,unit:'mm',axisMapping:{width:'x',height:'y',depth:'z'},components:[component(idA,firstNode,meshIndex,0,'Instance A'),component(idB,secondNode,meshIndex,0,'Instance B')],dependencies:[]};
  const configuration:ModelConfiguration={modelId:'shared',manifestVersion:1,placement:{locked:true,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}},components:{[idA]:state([100,0,0]),[idB]:state([-200,0,0])}};
  const targets=prepareComponentTargets(document,manifest);
  for(const definition of manifest.components)applyTargetTransform(targets.get(definition.id)!,manifest,configuration.components[definition.id]);
  assert(Math.abs(targets.get(idA)!.node.getTranslation()[0]-.1)<1e-6,'instance A must move independently');
  assert(Math.abs(targets.get(idB)!.node.getTranslation()[0]-1.8)<1e-6,'instance B must preserve authored translation plus own delta');
  const reimported=await validateRoundTrip(document,'shared-mesh');
  assert.equal(reimported.getRoot().listNodes().filter(node=>node.getMesh()).length,2,'shared mesh round trip must keep two node instances');
}

async function multiPrimitiveCase(){
  const document=new Document();
  const mesh=document.createMesh('Two Materials').addPrimitive(trianglePrimitive(document,0)).addPrimitive(trianglePrimitive(document,2));
  const node=document.createNode('Assembly').setMesh(mesh);
  document.createScene('Product').addChild(node);
  document.getRoot().setDefaultScene(document.getRoot().listScenes()[0]);
  const nodeIndex=document.getRoot().listNodes().indexOf(node),meshIndex=document.getRoot().listMeshes().indexOf(mesh);
  const id0=`cmp_node_${String(nodeIndex).padStart(4,'0')}_mesh_${String(meshIndex).padStart(4,'0')}_prim_00`;
  const id1=`cmp_node_${String(nodeIndex).padStart(4,'0')}_mesh_${String(meshIndex).padStart(4,'0')}_prim_01`;
  const manifest:ModelManifest={modelId:'multi-primitive',version:1,unit:'mm',axisMapping:{width:'x',height:'y',depth:'z'},components:[component(id0,nodeIndex,meshIndex,0,'Primitive 1'),component(id1,nodeIndex,meshIndex,1,'Primitive 2')],dependencies:[]};
  const configuration:ModelConfiguration={modelId:'multi-primitive',manifestVersion:1,placement:{locked:true,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}},components:{[id0]:state([100,0,0]),[id1]:state([-100,0,0])}};
  const targets=prepareComponentTargets(document,manifest);
  assert.equal(targets.size,2,'two primitives must become two independent targets');
  for(const definition of manifest.components)applyTargetTransform(targets.get(definition.id)!,manifest,configuration.components[definition.id]);
  const target0=targets.get(id0)!,target1=targets.get(id1)!;
  assert(Math.abs(target0.node.getTranslation()[0]-.1)<1e-6);
  assert(Math.abs(target1.node.getTranslation()[0]+.1)<1e-6);
  const reimported=await validateRoundTrip(document,'multi-primitive');
  const partNodes=reimported.getRoot().listNodes().filter(item=>item.getName().endsWith(' Export')&&item.getMesh());
  assert.equal(partNodes.length,2,'multi-primitive round trip must preserve independent child nodes');
  assert.equal(partNodes.reduce((sum,item)=>sum+(item.getMesh()?.listPrimitives().length??0),0),2,'both primitives must survive');
}

async function main(){
  await sharedMeshCase();
  await multiPrimitiveCase();
  console.log(JSON.stringify({event:'export_structure_smoke',sharedMesh:true,multiPrimitive:true}));
}

main().catch(error=>{console.error(error);process.exitCode=1;});
