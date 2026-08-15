'use client';
import {Suspense,useEffect,useMemo,useRef} from 'react';
import {Canvas} from '@react-three/fiber';
import {Grid,OrbitControls,TransformControls,useGLTF} from '@react-three/drei';
import * as THREE from 'three';
import type {ModelConfiguration,ModelManifest,TransformState} from '@product3d/model-schema';
import {useEditorStore} from '../lib/store';
import {demoMaterials} from '../lib/materials';

const EMPTY_TRANSFORM:TransformState={position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]};

type BaseMaterialState={color:string;roughness:number;metalness:number}|null;

function stablePath(object:THREE.Object3D){
  const names:string[]=[]; let current:THREE.Object3D|null=object;
  while(current){const index=current.parent?current.parent.children.indexOf(current):0;names.push(`${current.name||current.type}[${index}]`);current=current.parent;}
  return names.reverse().join('/');
}

function captureMaterial(material:THREE.Material):BaseMaterialState{
  return material instanceof THREE.MeshStandardMaterial
    ? {color:material.color.getHexString(),roughness:material.roughness,metalness:material.metalness}
    : null;
}

function prepareScene(scene:THREE.Object3D,modelId:string){
  const clone=scene.clone(true);
  const components:ModelManifest['components']=[];
  const configurations:ModelConfiguration['components']={};
  let meshIndex=0;
  clone.updateMatrixWorld(true);
  clone.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    meshIndex+=1;
    const componentId=`cmp_${String(meshIndex).padStart(4,'0')}`;
    const sourcePath=stablePath(object);
    object.userData.__componentId=componentId;
    object.userData.__baseScale=object.scale.toArray();
    object.userData.__basePosition=object.position.toArray();
    object.userData.__baseRotation=[object.rotation.x,object.rotation.y,object.rotation.z];
    if(Array.isArray(object.material)){
      object.material=object.material.map((material:THREE.Material)=>material.clone());
      object.userData.__baseMaterials=object.material.map((material:THREE.Material)=>captureMaterial(material));
    }else{
      object.material=object.material.clone();
      object.userData.__baseMaterials=[captureMaterial(object.material)];
    }
    const box=new THREE.Box3().setFromObject(object);
    const size=new THREE.Vector3();box.getSize(size);
    const dimensions={width:Math.max(size.x*1000,.001),height:Math.max(size.y*1000,.001),depth:Math.max(size.z*1000,.001)};
    components.push({id:componentId,sourceNodeIds:[sourcePath],sourceMeshIds:[sourcePath],name:object.name||`Mesh ${meshIndex}`,role:'UNKNOWN',editable:false,editableAxes:{x:false,y:false,z:false},scalingMode:'FIXED',constraints:{width:null,height:null,depth:null},anchorIds:[],materialSlotIds:[]});
    configurations[componentId]={originalDimensionsMm:dimensions,dimensionsMm:{...dimensions},transform:{...EMPTY_TRANSFORM},visible:true,deleted:false};
  });
  const manifest:ModelManifest={modelId,version:1,unit:'mm',axisMapping:{width:'x',height:'y',depth:'z'},components,dependencies:[]};
  const configuration:ModelConfiguration={modelId,manifestVersion:1,placement:{locked:false,transform:{...EMPTY_TRANSFORM}},components:configurations};
  return {scene:clone,manifest,configuration};
}

function LoadedModel({url}:{url:string}){
  const gltf=useGLTF(url);
  const {assetName,phase,manifest,configuration,selected,setPreparedAsset,select,setPlacementTransform,placementMode}=useEditorStore();
  const modelId=useMemo(()=>`mdl_${(assetName||'asset').replace(/[^a-zA-Z0-9]+/g,'_').toLowerCase()}`,[assetName]);
  const prepared=useMemo(()=>prepareScene(gltf.scene,modelId),[gltf.scene,modelId]);
  const groupRef=useRef<THREE.Group>(null);
  useEffect(()=>setPreparedAsset(prepared.manifest,prepared.configuration),[prepared,setPreparedAsset]);

  useEffect(()=>{
    if(!configuration||!manifest)return;
    prepared.scene.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      const componentId=object.userData.__componentId as string|undefined;if(!componentId)return;
      const state=configuration.components[componentId];if(!state)return;
      const baseScale=object.userData.__baseScale as number[];
      const basePosition=object.userData.__basePosition as number[];
      const baseRotation=object.userData.__baseRotation as number[];
      const sx=state.dimensionsMm.width/state.originalDimensionsMm.width;
      const sy=state.dimensionsMm.height/state.originalDimensionsMm.height;
      const sz=state.dimensionsMm.depth/state.originalDimensionsMm.depth;
      object.scale.set(baseScale[0]*sx,baseScale[1]*sy,baseScale[2]*sz);
      object.position.set(basePosition[0]+state.transform.position[0]/1000,basePosition[1]+state.transform.position[1]/1000,basePosition[2]+state.transform.position[2]/1000);
      object.rotation.set(baseRotation[0]+state.transform.rotation[0],baseRotation[1]+state.transform.rotation[1],baseRotation[2]+state.transform.rotation[2]);
      object.visible=state.visible&&!state.deleted;
      const materialPreset=state.materialId?demoMaterials.find(item=>item.id===state.materialId):undefined;
      const materials:THREE.Material[]=Array.isArray(object.material)?object.material:[object.material];
      const baseMaterials=object.userData.__baseMaterials as BaseMaterialState[];
      for(const [materialIndex,material] of materials.entries()){
        if(!(material instanceof THREE.MeshStandardMaterial))continue;
        const baseMaterial=baseMaterials?.[materialIndex];
        if(baseMaterial){material.color.set(`#${baseMaterial.color}`);material.roughness=baseMaterial.roughness;material.metalness=baseMaterial.metalness;}
        if(materialPreset?.baseColor)material.color.set(materialPreset.baseColor);
        if(materialPreset){material.roughness=materialPreset.roughness;material.metalness=materialPreset.metalness;}
        if(state.color)material.color.set(state.color);
        material.emissive.set(componentId===selected?'#1e4f85':'#000000');
        material.emissiveIntensity=componentId===selected ? .18 : 0;
      }
    });
  },[configuration,manifest,prepared.scene,selected]);

  useEffect(()=>{
    if(!groupRef.current||!configuration)return;
    const transform=configuration.placement.transform;
    groupRef.current.position.fromArray(transform.position);
    groupRef.current.rotation.set(...transform.rotation);
    groupRef.current.scale.fromArray(transform.scale);
  },[configuration?.placement.transform]);

  const model=<group ref={groupRef} onPointerDown={event=>{event.stopPropagation();const id=event.object.userData.__componentId as string|undefined;if(id)select(id);}}><primitive object={prepared.scene}/></group>;
  if(phase==='EDITOR'&&!configuration?.placement.locked){
    return <TransformControls mode={placementMode} onObjectChange={()=>{const object=groupRef.current;if(!object)return;setPlacementTransform({position:object.position.toArray() as [number,number,number],rotation:[object.rotation.x,object.rotation.y,object.rotation.z],scale:object.scale.toArray() as [number,number,number]});}}>{model}</TransformControls>;
  }
  return model;
}

export default function ModelViewport(){
  const assetUrl=useEditorStore(state=>state.assetUrl);
  return <Canvas camera={{position:[3.8,2.8,4.8],fov:42}} shadows onPointerMissed={()=>useEditorStore.getState().select(undefined)}>
    <ambientLight intensity={1.25}/><directionalLight position={[4,7,5]} intensity={2.2} castShadow/>
    <Grid args={[20,20]} infiniteGrid fadeDistance={25}/><OrbitControls makeDefault/>
    {assetUrl?<Suspense fallback={null}><LoadedModel url={assetUrl}/></Suspense>:null}
  </Canvas>;
}
