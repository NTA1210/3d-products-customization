'use client';

import {Suspense,useEffect,useMemo,useRef} from 'react';
import {Canvas} from '@react-three/fiber';
import {
  Bounds,
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  TransformControls,
  useGLTF,
} from '@react-three/drei';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import type {ModelConfiguration,ModelManifest,TransformState} from '@product3d/model-schema';
import {useEditorStore} from '../lib/store';
import {demoMaterials} from '../lib/materials';
import {reportViewerLoad} from '../lib/metrics';

const EMPTY_TRANSFORM:TransformState={position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]};
type BaseMaterialState={color:string;roughness:number;metalness:number}|null;
type GltfAssociation={nodes?:number;meshes?:number;primitives?:number};
const variantCache=new Map<string,Promise<THREE.Object3D>>();
const pendingDisposals=new WeakMap<THREE.Object3D,symbol>();

function pad(value:number,size=4){return String(value).padStart(size,'0');}
function stablePath(object:THREE.Object3D){const names:string[]=[];let current:THREE.Object3D|null=object;while(current){const index=current.parent?current.parent.children.indexOf(current):0;names.push(`${current.name||current.type}[${index}]`);current=current.parent;}return names.reverse().join('/');}
function hashPath(value:string){let hash=2166136261;for(let index=0;index<value.length;index+=1){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619);}return(hash>>>0).toString(16).padStart(8,'0');}
function captureMaterial(material:THREE.Material):BaseMaterialState{return material instanceof THREE.MeshStandardMaterial?{color:material.color.getHexString(),roughness:material.roughness,metalness:material.metalness}:null;}
function associationFor(object:THREE.Object3D,associations:Map<THREE.Object3D,GltfAssociation>){let current:THREE.Object3D|null=object,result:GltfAssociation={};while(current){const value=associations.get(current);if(result.nodes===undefined&&value?.nodes!==undefined)result.nodes=value.nodes;if(result.meshes===undefined&&value?.meshes!==undefined)result.meshes=value.meshes;if(result.primitives===undefined&&value?.primitives!==undefined)result.primitives=value.primitives;current=current.parent;}return result;}
function identity(association:GltfAssociation,path:string){if(association.nodes!==undefined&&association.meshes!==undefined){const primitive=association.primitives??0;return{id:`cmp_node_${pad(association.nodes)}_mesh_${pad(association.meshes)}_prim_${pad(primitive,2)}`,nodeId:`node_${pad(association.nodes)}`,meshId:`mesh_${pad(association.meshes)}`};}return{id:`cmp_path_${hashPath(path)}`,nodeId:`path:${path}`,meshId:`path:${path}`};}

function cloneOwnedMaterial(material:THREE.Material){
  const clone=material.clone();
  for(const key of Object.keys(clone)){const value=(clone as unknown as Record<string,unknown>)[key];if(value instanceof THREE.Texture)(clone as unknown as Record<string,unknown>)[key]=value.clone();}
  return clone;
}
function cloneOwnedScene(source:THREE.Object3D){
  const clone=source.clone(true);
  clone.traverse(object=>{if(!(object instanceof THREE.Mesh))return;object.geometry=object.geometry.clone();object.material=Array.isArray(object.material)?object.material.map(cloneOwnedMaterial):cloneOwnedMaterial(object.material);});
  return clone;
}
function disposeObject3D(root:THREE.Object3D){
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  root.traverse(object=>{if(!(object instanceof THREE.Mesh))return;geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material]){materials.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);}});
  for(const texture of textures)texture.dispose();for(const material of materials)material.dispose();for(const geometry of geometries)geometry.dispose();
}
function retainOwnedObject3D(root:THREE.Object3D){pendingDisposals.delete(root);}
function releaseOwnedObject3D(root:THREE.Object3D){
  const ticket=Symbol('dispose');
  pendingDisposals.set(root,ticket);
  queueMicrotask(()=>{
    if(pendingDisposals.get(root)!==ticket)return;
    pendingDisposals.delete(root);
    disposeObject3D(root);
  });
}

function prepare(scene:THREE.Object3D,associations:Map<THREE.Object3D,GltfAssociation>,modelId:string){
  const byPath=new Map<string,GltfAssociation>();scene.traverse(object=>byPath.set(stablePath(object),associationFor(object,associations)));
  const clone=cloneOwnedScene(scene),components:ModelManifest['components']=[],configs:ModelConfiguration['components']={};let count=0;clone.updateMatrixWorld(true);
  clone.traverse(object=>{if(!(object instanceof THREE.Mesh))return;count+=1;const path=stablePath(object),key=identity(byPath.get(path)??{},path);object.userData.__componentId=key.id;object.userData.__baseScale=object.scale.toArray();object.userData.__basePosition=object.position.toArray();object.userData.__baseRotation=[object.rotation.x,object.rotation.y,object.rotation.z];const materials:THREE.Material[]=Array.isArray(object.material)?object.material:[object.material];object.userData.__baseMaterials=materials.map(captureMaterial);const box=new THREE.Box3().setFromObject(object),size=new THREE.Vector3();box.getSize(size);const dimensions={width:Math.max(size.x*1000,.001),height:Math.max(size.y*1000,.001),depth:Math.max(size.z*1000,.001)};components.push({id:key.id,sourceNodeIds:[key.nodeId],sourceMeshIds:[key.meshId],name:object.name||`Mesh ${count}`,role:'UNKNOWN',editable:false,editableAxes:{x:false,y:false,z:false},scalingMode:'FIXED',constraints:{width:null,height:null,depth:null},anchorIds:[],materialSlotIds:[]});configs[key.id]={originalDimensionsMm:dimensions,dimensionsMm:{...dimensions},transform:{...EMPTY_TRANSFORM},visible:true,deleted:false};});
  return{scene:clone,manifest:{modelId,version:1,unit:'mm',axisMapping:{width:'x',height:'y',depth:'z'},components,dependencies:[]} satisfies ModelManifest,configuration:{modelId,manifestVersion:1,placement:{locked:false,transform:{...EMPTY_TRANSFORM}},components:configs} satisfies ModelConfiguration};
}
async function variantScene(url:string){let cached=variantCache.get(url);if(!cached){cached=new GLTFLoader().loadAsync(url).then(gltf=>gltf.scene);variantCache.set(url,cached);}return cloneOwnedScene(await cached);}
function highlight(root:THREE.Object3D,selected?:string){root.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const id=object.userData.__componentId as string|undefined;for(const material of Array.isArray(object.material)?object.material:[object.material])if(material instanceof THREE.MeshStandardMaterial){material.emissive.set(id===selected?'#1e4f85':'#000000');material.emissiveIntensity=id===selected?.18:0;}});}

function LoadedModel({url,loadStartedAt}:{url:string;loadStartedAt:number}){
  const gltf=useGLTF(url);const{assetName,phase,manifest,configuration,selected,setPreparedAsset,select,setPlacementTransform,placementMode,variants}=useEditorStore();
  const modelId=useMemo(()=>`mdl_${(assetName||'asset').replace(/[^a-zA-Z0-9]+/g,'_').toLowerCase()}`,[assetName]);
  const associations=(gltf.parser as unknown as{associations:Map<THREE.Object3D,GltfAssociation>}).associations;
  const prepared=useMemo(()=>prepare(gltf.scene,associations,modelId),[gltf.scene,associations,modelId]);
  const groupRef=useRef<THREE.Group>(null),variantInstances=useRef<THREE.Object3D[]>([]),loadReported=useRef(false);

  useEffect(()=>setPreparedAsset(prepared.manifest,prepared.configuration),[prepared,setPreparedAsset]);
  useEffect(()=>{if(loadReported.current||loadStartedAt<=0)return;loadReported.current=true;void reportViewerLoad(performance.now()-loadStartedAt);},[loadStartedAt]);
  useEffect(()=>{
    retainOwnedObject3D(prepared.scene);
    return()=>releaseOwnedObject3D(prepared.scene);
  },[prepared.scene]);

  useEffect(()=>{if(!configuration||!manifest)return;prepared.scene.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const id=object.userData.__componentId as string|undefined;if(!id)return;const state=configuration.components[id];if(!state)return;const baseScale=object.userData.__baseScale as number[],basePosition=object.userData.__basePosition as number[],baseRotation=object.userData.__baseRotation as number[];object.scale.set(baseScale[0]*state.dimensionsMm.width/state.originalDimensionsMm.width,baseScale[1]*state.dimensionsMm.height/state.originalDimensionsMm.height,baseScale[2]*state.dimensionsMm.depth/state.originalDimensionsMm.depth);object.position.set(basePosition[0]+state.transform.position[0]/1000,basePosition[1]+state.transform.position[1]/1000,basePosition[2]+state.transform.position[2]/1000);object.rotation.set(baseRotation[0]+state.transform.rotation[0],baseRotation[1]+state.transform.rotation[1],baseRotation[2]+state.transform.rotation[2]);object.visible=state.visible&&!state.deleted&&!state.variantId;const preset=state.materialId?demoMaterials.find(item=>item.id===state.materialId):undefined,materials:THREE.Material[]=Array.isArray(object.material)?object.material:[object.material],bases=object.userData.__baseMaterials as BaseMaterialState[];for(const[index,material]of materials.entries()){if(!(material instanceof THREE.MeshStandardMaterial))continue;const base=bases?.[index];if(base){material.color.set(`#${base.color}`);material.roughness=base.roughness;material.metalness=base.metalness;}if(preset?.baseColor)material.color.set(preset.baseColor);if(preset){material.roughness=preset.roughness;material.metalness=preset.metalness;}if(state.color)material.color.set(state.color);}});},[configuration,manifest,prepared.scene]);

  useEffect(()=>{let cancelled=false;for(const item of variantInstances.current){item.removeFromParent();disposeObject3D(item);}variantInstances.current=[];if(!configuration)return()=>{cancelled=true;};const tasks=Object.entries(configuration.components).filter(([,state])=>Boolean(state.variantId)&&state.visible&&!state.deleted).map(async([id,state])=>{const variant=state.variantId?variants[state.variantId]:undefined;if(!variant)return;let sourceObject:THREE.Object3D|undefined;prepared.scene.traverse(object=>{if(object.userData.__componentId===id)sourceObject=object;});if(!sourceObject?.parent)return;const instance=await variantScene(variant.signedUrl);if(cancelled){disposeObject3D(instance);return;}instance.name=`Variant ${variant.name}`;instance.traverse(object=>{object.userData.__componentId=id;});sourceObject.parent.add(instance);instance.position.copy(sourceObject.position);instance.rotation.copy(sourceObject.rotation);const box=new THREE.Box3().setFromObject(instance),size=new THREE.Vector3();box.getSize(size);if(variant.dimensionPolicy==='AUTO_FIT'&&size.x>0&&size.y>0&&size.z>0)instance.scale.set(state.dimensionsMm.width/1000/size.x*state.transform.scale[0],state.dimensionsMm.height/1000/size.y*state.transform.scale[1],state.dimensionsMm.depth/1000/size.z*state.transform.scale[2]);variantInstances.current.push(instance);highlight(instance,useEditorStore.getState().selected);});void Promise.all(tasks);return()=>{cancelled=true;for(const item of variantInstances.current){item.removeFromParent();disposeObject3D(item);}variantInstances.current=[];};},[configuration,variants,prepared.scene]);
  useEffect(()=>{highlight(prepared.scene,selected);for(const instance of variantInstances.current)highlight(instance,selected);},[prepared.scene,selected]);
  useEffect(()=>{if(!groupRef.current||!configuration)return;const transform=configuration.placement.transform;groupRef.current.position.fromArray(transform.position);groupRef.current.rotation.set(...transform.rotation);groupRef.current.scale.fromArray(transform.scale);},[configuration?.placement.transform]);

  const model=<group ref={groupRef} onPointerDown={event=>{event.stopPropagation();let object:THREE.Object3D|null=event.object;while(object&&!object.userData.__componentId)object=object.parent;const id=object?.userData.__componentId as string|undefined;if(id)select(id);}}><primitive object={prepared.scene}/></group>;
  if(phase==='EDITOR'&&!configuration?.placement.locked)return <TransformControls mode={placementMode} onObjectChange={()=>{const object=groupRef.current;if(!object)return;setPlacementTransform({position:object.position.toArray() as[number,number,number],rotation:[object.rotation.x,object.rotation.y,object.rotation.z],scale:object.scale.toArray() as[number,number,number]});}}>{model}</TransformControls>;
  return model;
}

function NavigationAids(){
  return <>
    <Grid
      infiniteGrid
      args={[10,10]}
      cellSize={1}
      sectionSize={10}
      fadeDistance={100000}
      fadeStrength={1}
      side={THREE.DoubleSide}
      depthWrite={false}
    />
    <axesHelper args={[10]}/>
    <GizmoHelper alignment="bottom-right" margin={[80,80]}>
      <GizmoViewport
        axisColors={['#e55757','#58b86b','#4b83e6']}
        labelColor="white"
      />
    </GizmoHelper>
  </>;
}

export default function ModelViewport(){
  const assetUrl=useEditorStore(state=>state.assetUrl);
  const loadStartedAt=useMemo(()=>assetUrl&&typeof performance!=='undefined'?performance.now():0,[assetUrl]);
  return <Canvas
    dpr={[1,2]}
    gl={{powerPreference:'high-performance'}}
    camera={{position:[4,3,5],fov:45,near:.01,far:100000}}
    shadows
    onPointerMissed={()=>useEditorStore.getState().select(undefined)}
  >
    <ambientLight intensity={1.25}/>
    <directionalLight position={[4,7,5]} intensity={2.2} castShadow/>
    <NavigationAids/>
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={.08}
      screenSpacePanning
      minDistance={.02}
      maxDistance={100000}
    />
    {assetUrl?<Suspense fallback={null}>
      <Bounds key={assetUrl} fit clip observe margin={1.2}>
        <LoadedModel url={assetUrl} loadStartedAt={loadStartedAt}/>
      </Bounds>
    </Suspense>:null}
  </Canvas>;
}
