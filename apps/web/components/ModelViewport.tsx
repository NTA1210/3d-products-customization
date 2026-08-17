'use client';

import {Suspense,useCallback,useEffect,useMemo,useRef} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {Bounds,GizmoHelper,GizmoViewport,Grid,Html,OrbitControls,TransformControls,useGLTF} from '@react-three/drei';
import {analyzeTriangleTopology,type TriangleRegion} from '@product3d/geometry-topology';
import type {EditorAction} from '@product3d/action-engine';
import type {AnchorDefinition,ModelConfiguration,ModelManifest,TransformState} from '@product3d/model-schema';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {useDccViewportStore} from '../lib/dcc-viewport-store';
import {useEditorStore} from '../lib/store';
import {useMeasurementStore,type RuntimeMeasurement} from '../lib/measurement-store';
import {flattenComponentObjects,hasNestedComponentObjects} from '../lib/component-scene';
import {demoMaterials} from '../lib/materials';
import {resolveGroundBarrier} from '../lib/ground-barrier';
import {useSnapInteractionStore,type LabelMode} from '../lib/snap-store';
import {
  anchorWorldPosition,
  autoAnchorsForMesh,
  findNearestAnchorCandidate,
  snappedLocalTransform,
  type RuntimeSnapCandidate,
} from '../lib/anchor-runtime';
import {reportViewerLoad} from '../lib/metrics';

const MAX_REGION_COMPONENTS=32;
const MAX_MODEL_COMPONENTS=96;
const SNAP_PIXELS=18;
const NEAREST_INDICATOR_PIXELS=96;
const GROUND_BREAK_PIXELS=32;
type BaseMaterialState={color:string;roughness:number;metalness:number}|null;
type GltfAssociation={nodes?:number;meshes?:number;primitives?:number};
type PreparedPart={mesh:THREE.Mesh;id:string;nodeId:string;meshId:string;name:string;sourceRegionIds?:string[]};
type DragSnapshot={position:THREE.Vector3;rotation:THREE.Euler;scale:THREE.Vector3;state:ModelConfiguration['components'][string]};
type GroundDragState={released:boolean;breakDistanceWorld:number};
type OrbitControlsLike={target:THREE.Vector3;update:()=>void};
type ActiveSnapCandidate=RuntimeSnapCandidate&{ready:boolean};
const variantCache=new Map<string,Promise<THREE.Object3D>>();
const pendingDisposals=new WeakMap<THREE.Object3D,symbol>();

function freshTransform():TransformState{return{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]};}
function pad(value:number,size=4){return String(value).padStart(size,'0');}
function stablePath(object:THREE.Object3D){const names:string[]=[];let current:THREE.Object3D|null=object;while(current){const index=current.parent?current.parent.children.indexOf(current):0;names.push(`${current.name||current.type}[${index}]`);current=current.parent;}return names.reverse().join('/');}
function hashPath(value:string){let hash=2166136261;for(let index=0;index<value.length;index+=1){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619);}return(hash>>>0).toString(16).padStart(8,'0');}
function captureMaterial(material:THREE.Material):BaseMaterialState{return material instanceof THREE.MeshStandardMaterial?{color:material.color.getHexString(),roughness:material.roughness,metalness:material.metalness}:null;}
function associationFor(object:THREE.Object3D,associations:Map<THREE.Object3D,GltfAssociation>){let current:THREE.Object3D|null=object,result:GltfAssociation={};while(current){const value=associations.get(current);if(result.nodes===undefined&&value?.nodes!==undefined)result.nodes=value.nodes;if(result.meshes===undefined&&value?.meshes!==undefined)result.meshes=value.meshes;if(result.primitives===undefined&&value?.primitives!==undefined)result.primitives=value.primitives;current=current.parent;}return result;}
function identity(association:GltfAssociation,path:string){if(association.nodes!==undefined&&association.meshes!==undefined){const primitive=association.primitives??0;return{id:`cmp_node_${pad(association.nodes)}_mesh_${pad(association.meshes)}_prim_${pad(primitive,2)}`,nodeId:`node_${pad(association.nodes)}`,meshId:`mesh_${pad(association.meshes)}`,primitive};}return{id:`cmp_path_${hashPath(path)}`,nodeId:`path:${path}`,meshId:`path:${path}`,primitive:0};}

function cloneOwnedMaterial(material:THREE.Material){const clone=material.clone();for(const key of Object.keys(clone)){const value=(clone as unknown as Record<string,unknown>)[key];if(value instanceof THREE.Texture)(clone as unknown as Record<string,unknown>)[key]=value.clone();}return clone;}
function cloneOwnedScene(source:THREE.Object3D){const clone=source.clone(true);clone.traverse(object=>{if(!(object instanceof THREE.Mesh))return;object.geometry=object.geometry.clone();object.material=Array.isArray(object.material)?object.material.map(cloneOwnedMaterial):cloneOwnedMaterial(object.material);});return clone;}
function disposeObject3D(root:THREE.Object3D){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();root.traverse(object=>{if(!(object instanceof THREE.Mesh))return;geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material]){materials.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);}});for(const texture of textures)texture.dispose();for(const material of materials)material.dispose();for(const geometry of geometries)geometry.dispose();}
function disposeDetachedMesh(mesh:THREE.Mesh){mesh.geometry.dispose();for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.dispose();}
function retainOwnedObject3D(root:THREE.Object3D){pendingDisposals.delete(root);}
function releaseOwnedObject3D(root:THREE.Object3D){const ticket=Symbol('dispose');pendingDisposals.set(root,ticket);queueMicrotask(()=>{if(pendingDisposals.get(root)!==ticket)return;pendingDisposals.delete(root);disposeObject3D(root);});}

function attributeValue(attribute:THREE.BufferAttribute|THREE.InterleavedBufferAttribute,index:number,component:number){if(component===0)return attribute.getX(index);if(component===1)return attribute.getY(index);if(component===2)return attribute.getZ(index);return attribute.getW(index);}
function topologyForGeometry(geometry:THREE.BufferGeometry){const position=geometry.getAttribute('position');if(!position||position.itemSize<3)return undefined;const positions=new Float64Array(position.count*3);for(let index=0;index<position.count;index+=1){positions[index*3]=position.getX(index);positions[index*3+1]=position.getY(index);positions[index*3+2]=position.getZ(index);}const sourceIndex=geometry.getIndex();let indices:Uint32Array|undefined;if(sourceIndex){indices=new Uint32Array(sourceIndex.count);for(let index=0;index<sourceIndex.count;index+=1)indices[index]=sourceIndex.getX(index);}return analyzeTriangleTopology({positions,indices});}
function regionGeometry(source:THREE.BufferGeometry,region:TriangleRegion){const center=new THREE.Vector3((region.bounds.min[0]+region.bounds.max[0])/2,(region.bounds.min[1]+region.bounds.max[1])/2,(region.bounds.min[2]+region.bounds.max[2])/2);const mapping=new Map<number,number>();region.vertexIndices.forEach((oldIndex,newIndex)=>mapping.set(oldIndex,newIndex));const geometry=new THREE.BufferGeometry();for(const[name,attribute]of Object.entries(source.attributes)){const values=new Float32Array(region.vertexIndices.length*attribute.itemSize);region.vertexIndices.forEach((oldIndex,newIndex)=>{for(let component=0;component<attribute.itemSize;component+=1){let value=attributeValue(attribute,oldIndex,component);if(name==='position'&&component<3)value-=center.getComponent(component);values[newIndex*attribute.itemSize+component]=value;}});geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,attribute.itemSize));}const sourceIndex=source.getIndex();const remapped:number[]=[];for(const triangle of region.triangleIndices){for(let corner=0;corner<3;corner+=1){const oldIndex=sourceIndex?sourceIndex.getX(triangle*3+corner):triangle*3+corner;const next=mapping.get(oldIndex);if(next===undefined)throw new Error(`REGION_VERTEX_MAPPING_MISSING: ${oldIndex}`);remapped.push(next);}}const IndexArray=region.vertexIndices.length>65535?Uint32Array:Uint16Array;geometry.setIndex(new THREE.BufferAttribute(new IndexArray(remapped),1));geometry.computeBoundingBox();geometry.computeBoundingSphere();return{geometry,center};}
function dynamicMesh(mesh:THREE.Mesh){return mesh instanceof THREE.SkinnedMesh||mesh instanceof THREE.InstancedMesh||Boolean(mesh.morphTargetInfluences?.length)||Object.values(mesh.geometry.morphAttributes).some(items=>items.length>0);}
function initializePart(part:PreparedPart){part.mesh.userData.__componentId=part.id;part.mesh.userData.__baseScale=part.mesh.scale.toArray();part.mesh.userData.__basePosition=part.mesh.position.toArray();part.mesh.userData.__baseRotation=[part.mesh.rotation.x,part.mesh.rotation.y,part.mesh.rotation.z];const materials:THREE.Material[]=Array.isArray(part.mesh.material)?part.mesh.material:[part.mesh.material];part.mesh.userData.__baseMaterials=materials.map(captureMaterial);}
function manifestRegionIndexes(manifest:ModelManifest|undefined,keyId:string){if(!manifest)return[];const indexes:number[]=[];for(const component of manifest.components){if(!component.id.startsWith(`${keyId}_region_`))continue;const match=/_region_(\d+)$/.exec(component.id);if(match)indexes.push(Number(match[1]));}return indexes.sort((a,b)=>a-b);}

function prepare(scene:THREE.Object3D,associations:Map<THREE.Object3D,GltfAssociation>,modelId:string,existingManifest?:ModelManifest){
  const byPath=new Map<string,GltfAssociation>();scene.traverse(object=>byPath.set(stablePath(object),associationFor(object,associations)));
  const clone=cloneOwnedScene(scene);
  const meshObjects:THREE.Mesh[]=[];clone.traverse(object=>{if(object instanceof THREE.Mesh)meshObjects.push(object);});
  const plans=meshObjects.map(mesh=>{const path=stablePath(mesh),association=byPath.get(path)??{},key=identity(association,path),topology=dynamicMesh(mesh)?undefined:topologyForGeometry(mesh.geometry);return{mesh,association,key,topology};});
  const predictedParts=plans.reduce((sum,plan)=>{const regionCount=plan.topology?.regions.length??1;return sum+(regionCount>1&&regionCount<=MAX_REGION_COMPONENTS?regionCount:1);},0);
  const allowAutoRegionSplit=!existingManifest&&predictedParts<=MAX_MODEL_COMPONENTS;
  const parts:PreparedPart[]=[];let count=0;
  for(const plan of plans){
    const{mesh,association,key,topology}=plan;
    const regionCount=topology?.regions.length??0;
    const savedRegionIndexes=manifestRegionIndexes(existingManifest,key.id);
    const regions=existingManifest
      ?savedRegionIndexes.map(index=>topology?.regions[index]).filter((region):region is TriangleRegion=>Boolean(region))
      :allowAutoRegionSplit&&regionCount>1&&regionCount<=MAX_REGION_COMPONENTS?topology!.regions:[];
    if(regions.length>1&&mesh.parent){
      const parent=mesh.parent;
      const group=new THREE.Group();
      group.name=`${mesh.name||'Component'} Regions`;
      group.position.copy(mesh.position);group.quaternion.copy(mesh.quaternion);group.scale.copy(mesh.scale);group.visible=mesh.visible;
      parent.add(group);
      for(const child of [...mesh.children])group.add(child);
      for(const region of regions){
        count+=1;
        const extracted=regionGeometry(mesh.geometry,region);
        const materials=Array.isArray(mesh.material)?mesh.material.map(material=>material.clone()):mesh.material.clone();
        const regionMesh=new THREE.Mesh(extracted.geometry,materials);
        regionMesh.name=`${mesh.name||`Mesh ${count}`} · Region ${region.islandIndex+1}`;
        regionMesh.position.copy(extracted.center);
        group.add(regionMesh);
        const id=`${key.id}_region_${pad(region.islandIndex,3)}`;
        parts.push({mesh:regionMesh,id,nodeId:key.nodeId,meshId:key.meshId,name:regionMesh.name,sourceRegionIds:[`${key.meshId}_prim_${pad(association.primitives??0,2)}_island_${pad(region.islandIndex,3)}`]});
      }
      parent.remove(mesh);disposeDetachedMesh(mesh);
    }else{
      count+=1;
      parts.push({mesh,id:key.id,nodeId:key.nodeId,meshId:key.meshId,name:mesh.name||`Mesh ${count}`});
    }
  }

  const runtimeComponents=parts.map(part=>({id:part.id,object:part.mesh as THREE.Object3D}));
  flattenComponentObjects(clone,runtimeComponents);
  if(hasNestedComponentObjects(runtimeComponents))throw new Error('EDITOR_COMPONENT_HIERARCHY_NOT_FLAT');

  for(const part of parts)initializePart(part);clone.updateMatrixWorld(true);
  const components:ModelManifest['components']=[],configs:ModelConfiguration['components']={},anchors:AnchorDefinition[]=[];
  for(const part of parts){
    const box=new THREE.Box3().setFromObject(part.mesh),size=new THREE.Vector3();box.getSize(size);
    const dimensions={width:Math.max(size.x*1000,.001),height:Math.max(size.y*1000,.001),depth:Math.max(size.z*1000,.001)};
    const partAnchors=autoAnchorsForMesh(part.id,part.mesh);anchors.push(...partAnchors);
    components.push({id:part.id,sourceNodeIds:[part.nodeId],sourceMeshIds:[part.meshId],sourceRegionIds:part.sourceRegionIds,name:part.name,role:'UNKNOWN',editable:false,editableAxes:{x:false,y:false,z:false},scalingMode:'FIXED',constraints:{width:null,height:null,depth:null},anchorIds:partAnchors.map(anchor=>anchor.id),materialSlotIds:[]});
    configs[part.id]={originalDimensionsMm:dimensions,dimensionsMm:{...dimensions},transform:freshTransform(),visible:true,deleted:false};
  }
  return{
    scene:clone,
    manifest:{modelId,version:1,unit:'mm',axisMapping:{width:'x',height:'y',depth:'z'},components,dependencies:[],anchors} satisfies ModelManifest,
    configuration:{modelId,manifestVersion:1,placement:{locked:false,transform:freshTransform()},components:configs,attachments:[]} satisfies ModelConfiguration,
  };
}

async function variantScene(url:string){let cached=variantCache.get(url);if(!cached){cached=new GLTFLoader().loadAsync(url).then(gltf=>gltf.scene);variantCache.set(url,cached);}return cloneOwnedScene(await cached);}
function highlight(root:THREE.Object3D,selected?:string){root.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const id=object.userData.__componentId as string|undefined;for(const material of Array.isArray(object.material)?object.material:[object.material])if(material instanceof THREE.MeshStandardMaterial){material.emissive.set(id===selected?'#1e4f85':'#000000');material.emissiveIntensity=id===selected?.35:0;}});}
function findComponentObject(root:THREE.Object3D,componentId?:string){if(!componentId)return undefined;let match:THREE.Mesh|undefined;root.traverse(object=>{if(!match&&object instanceof THREE.Mesh&&object.userData.__componentId===componentId)match=object;});return match;}
function componentObjectMap(root:THREE.Object3D){const result=new Map<string,THREE.Object3D>();root.traverse(object=>{const id=object.userData.__componentId as string|undefined;if(id&&!result.has(id))result.set(id,object);});return result;}
function normalizeAngle(value:number){while(value>Math.PI)value-=Math.PI*2;while(value<-Math.PI)value+=Math.PI*2;return value;}
function moveObjectWorldY(object:THREE.Object3D,deltaWorldY:number){if(Math.abs(deltaWorldY)<1e-9)return;object.updateWorldMatrix(true,false);const worldPosition=object.getWorldPosition(new THREE.Vector3());worldPosition.y+=deltaWorldY;if(object.parent){object.parent.updateWorldMatrix(true,false);object.parent.worldToLocal(worldPosition);}object.position.copy(worldPosition);object.updateWorldMatrix(true,true);}

function isVisibleInside(object:THREE.Object3D,root:THREE.Object3D){let current:THREE.Object3D|null=object;while(current){if(!current.visible)return false;if(current===root)return true;current=current.parent;}return false;}
function measureRelative(root:THREE.Object3D,relativeTo:THREE.Object3D,componentId?:string):RuntimeMeasurement|undefined{
  relativeTo.updateWorldMatrix(true,true);const inverse=relativeTo.matrixWorld.clone().invert();const bounds=new THREE.Box3();let found=false;
  root.traverse(object=>{if(!(object instanceof THREE.Mesh))return;if(componentId&&object.userData.__componentId!==componentId)return;if(!isVisibleInside(object,root))return;if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();const sourceBox=object.geometry.boundingBox;if(!sourceBox||sourceBox.isEmpty())return;object.updateWorldMatrix(true,false);const matrix=new THREE.Matrix4().multiplyMatrices(inverse,object.matrixWorld);const next=sourceBox.clone().applyMatrix4(matrix);if(!found){bounds.copy(next);found=true;}else bounds.union(next);});
  if(!found||bounds.isEmpty())return undefined;const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());const toMm=(value:number)=>value*1000;
  return{widthMm:toMm(size.x),heightMm:toMm(size.y),depthMm:toMm(size.z),minMm:[toMm(bounds.min.x),toMm(bounds.min.y),toMm(bounds.min.z)],maxMm:[toMm(bounds.max.x),toMm(bounds.max.y),toMm(bounds.max.z)],centerMm:[toMm(center.x),toMm(center.y),toMm(center.z)]};
}

function SelectionIndicator({target,label,visible,showLabel}:{target?:THREE.Object3D;label?:string;visible:boolean;showLabel:boolean}){const box=useMemo(()=>new THREE.Box3(),[]);const helper=useMemo(()=>{const next=new THREE.Box3Helper(box,'#4cc9ff');const material=next.material as THREE.LineBasicMaterial;material.depthTest=false;material.transparent=true;material.opacity=.95;next.renderOrder=1000;return next;},[box]);const labelRef=useRef<THREE.Group>(null),size=useMemo(()=>new THREE.Vector3(),[]),center=useMemo(()=>new THREE.Vector3(),[]);useEffect(()=>()=>{helper.geometry.dispose();(helper.material as THREE.LineBasicMaterial).dispose();},[helper]);useFrame(()=>{const show=Boolean(visible&&target);helper.visible=show;if(labelRef.current)labelRef.current.visible=show&&showLabel;if(!show||!target)return;target.updateWorldMatrix(true,true);box.setFromObject(target);if(box.isEmpty()){helper.visible=false;if(labelRef.current)labelRef.current.visible=false;return;}box.getCenter(center);box.getSize(size);const offset=Math.max(size.length()*.04,.02);if(labelRef.current)labelRef.current.position.set(center.x,box.max.y+offset,center.z);});return <><primitive object={helper}/><group ref={labelRef} visible={false}><Html center style={{pointerEvents:'none'}}><div data-testid="selection-indicator" style={{whiteSpace:'nowrap',border:'1px solid #4cc9ff',borderRadius:6,background:'rgba(7,18,31,.92)',color:'#e9f8ff',padding:'4px 8px',fontSize:11,fontWeight:700}}>{label??'Selected component'}</div></Html></group></>;}

function ComponentLabels({objects,manifest,configuration,mode,selected}:{objects:Map<string,THREE.Object3D>;manifest?:ModelManifest;configuration?:ModelConfiguration;mode:LabelMode;selected?:string}){const refs=useRef(new Map<string,THREE.Group>()),boxes=useRef(new Map<string,THREE.Box3>()),sizes=useRef(new Map<string,THREE.Vector3>());useFrame(()=>{if(!manifest)return;for(const definition of manifest.components){const group=refs.current.get(definition.id);if(!group)continue;const state=configuration?.components[definition.id],target=objects.get(definition.id);const show=mode==='all'&&Boolean(state?.visible&&!state.deleted&&target);group.visible=show;if(!show||!target)continue;target.updateWorldMatrix(true,true);let box=boxes.current.get(definition.id);if(!box){box=new THREE.Box3();boxes.current.set(definition.id,box);}box.setFromObject(target);if(box.isEmpty()){group.visible=false;continue;}let size=sizes.current.get(definition.id);if(!size){size=new THREE.Vector3();sizes.current.set(definition.id,size);}box.getSize(size);const center=box.getCenter(new THREE.Vector3());group.position.set(center.x,box.max.y+Math.max(size.length()*.035,.018),center.z);}});if(!manifest)return null;return <>{manifest.components.map(definition=><group key={definition.id} ref={node=>{if(node)refs.current.set(definition.id,node);else refs.current.delete(definition.id);}} visible={false}><Html center style={{pointerEvents:'none'}}><div data-testid="component-label" style={{whiteSpace:'nowrap',border:`1px solid ${definition.id===selected?'#4cc9ff':'rgba(148,171,196,.5)'}`,borderRadius:5,background:'rgba(7,16,27,.82)',color:definition.id===selected?'#e9f8ff':'#c3cfdb',padding:'3px 6px',fontSize:10,fontWeight:definition.id===selected?800:600}}>{definition.name}</div></Html></group>)}</>;}

function ProximityIndicator({target,label,gapMm,compatible,ready}:{target?:THREE.Object3D;label?:string;gapMm:number;compatible:boolean;ready:boolean}){const box=useMemo(()=>new THREE.Box3(),[]);const helper=useMemo(()=>{const next=new THREE.Box3Helper(box,ready?'#65d98b':'#f4c66d');const material=next.material as THREE.LineBasicMaterial;material.depthTest=false;material.transparent=true;material.opacity=.95;next.renderOrder=999;return next;},[box,ready]);const labelRef=useRef<THREE.Group>(null),center=useMemo(()=>new THREE.Vector3(),[]),size=useMemo(()=>new THREE.Vector3(),[]);useEffect(()=>()=>{helper.geometry.dispose();(helper.material as THREE.LineBasicMaterial).dispose();},[helper]);useFrame(()=>{helper.visible=Boolean(target);if(labelRef.current)labelRef.current.visible=Boolean(target);if(!target)return;target.updateWorldMatrix(true,true);box.setFromObject(target);if(box.isEmpty()){helper.visible=false;if(labelRef.current)labelRef.current.visible=false;return;}box.getCenter(center);box.getSize(size);if(labelRef.current)labelRef.current.position.set(center.x,box.max.y+Math.max(size.length()*.08,.04),center.z);});return <><primitive object={helper}/><group ref={labelRef} visible={false}><Html center style={{pointerEvents:'none'}}><div data-testid="nearest-component-indicator" style={{whiteSpace:'nowrap',border:`1px solid ${ready?'#65d98b':'#f4c66d'}`,borderRadius:7,background:'rgba(10,18,28,.94)',color:'#f5f8fb',padding:'5px 8px',fontSize:11,fontWeight:700}}>{ready?'READY TO SNAP · ':compatible?'Nearest compatible · ':'Nearest part · '}{label??'Component'} · {Math.round(gapMm)} mm</div></Html></group></>;}

function AnchorMarkers({target,anchors,visible}:{target?:THREE.Object3D;anchors:AnchorDefinition[];visible:boolean}){const refs=useRef(new Map<string,THREE.Group>());useFrame(()=>{for(const anchor of anchors){const group=refs.current.get(anchor.id);if(!group)continue;group.visible=Boolean(visible&&target);if(visible&&target)group.position.copy(anchorWorldPosition(target,anchor));}});return <>{anchors.map(anchor=><group key={anchor.id} ref={node=>{if(node)refs.current.set(anchor.id,node);else refs.current.delete(anchor.id);}} visible={false}><Html center style={{pointerEvents:'none'}}><div title={anchor.name??anchor.id} style={{width:8,height:8,borderRadius:'50%',background:'#4cc9ff',border:'1px solid rgba(255,255,255,.9)',boxShadow:'0 0 0 2px rgba(76,201,255,.18)'}}/></Html></group>)}</>;}

function DccCameraController({selectedTarget,modelTarget,request}:{selectedTarget?:THREE.Object3D;modelTarget?:THREE.Object3D;request:{id:number;target:'selected'|'all'}}){
  const camera=useThree(state=>state.camera);const controls=useThree(state=>(state as unknown as{controls?:OrbitControlsLike}).controls);
  useEffect(()=>{
    if(!request.id||!controls?.target)return;
    const target=request.target==='selected'?selectedTarget:modelTarget;if(!target)return;
    target.updateWorldMatrix(true,true);const box=new THREE.Box3().setFromObject(target);if(box.isEmpty())return;
    const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    const radius=Math.max(size.length()*.5,.02);const direction=camera.position.clone().sub(controls.target);if(direction.lengthSq()<1e-8)direction.set(1,.75,1);direction.normalize();
    let distance=radius*2.5;
    if(camera instanceof THREE.PerspectiveCamera){const halfFov=THREE.MathUtils.degToRad(camera.fov*.5);distance=Math.max(radius/Math.max(Math.sin(halfFov),.05)*1.25,.08);}
    camera.position.copy(center).addScaledVector(direction,distance);controls.target.copy(center);
    if(camera instanceof THREE.PerspectiveCamera){camera.near=Math.max(distance/10000,.001);camera.far=Math.max(distance*10000,1000000);camera.updateProjectionMatrix();}
    controls.update();
  },[camera,controls,modelTarget,request.id,request.target,selectedTarget]);
  return null;
}

function worldPerPixel(camera:THREE.Camera,canvasHeight:number,point:THREE.Vector3){if(camera instanceof THREE.PerspectiveCamera){const distance=Math.max(camera.position.distanceTo(point),.001);return 2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)/Math.max(canvasHeight,1);}if(camera instanceof THREE.OrthographicCamera)return Math.abs(camera.top-camera.bottom)/Math.max(canvasHeight,1);return .001;}

function LoadedModel({url,loadStartedAt}:{url:string;loadStartedAt:number}){
  const gltf=useGLTF(url);const camera=useThree(state=>state.camera);const canvasSize=useThree(state=>state.size);
  const{assetName,phase,manifest,configuration,selected,setPreparedAsset,select,setPlacementTransform,placementMode,componentMode,variants,dispatchBatch}=useEditorStore();
  const snapEnabled=useSnapInteractionStore(state=>state.snapEnabled),labelMode=useSnapInteractionStore(state=>state.labelMode),setCandidate=useSnapInteractionStore(state=>state.setCandidate),candidateState=useSnapInteractionStore(state=>state.candidate),setGroundBarrier=useSnapInteractionStore(state=>state.setGroundBarrier);
  const transformSpace=useDccViewportStore(state=>state.transformSpace),gridSnapEnabled=useDccViewportStore(state=>state.gridSnapEnabled),gridStepMm=useDccViewportStore(state=>state.gridStepMm),rotationSnapDeg=useDccViewportStore(state=>state.rotationSnapDeg),gizmoSize=useDccViewportStore(state=>state.gizmoSize),frameRequest=useDccViewportStore(state=>state.frameRequest);
  const modelId=useMemo(()=>`mdl_${(assetName||'asset').replace(/[^a-zA-Z0-9]+/g,'_').toLowerCase()}`,[assetName]);
  const associations=(gltf.parser as unknown as{associations:Map<THREE.Object3D,GltfAssociation>}).associations;const manifestAtLoad=useRef(manifest);
  const prepared=useMemo(()=>prepare(gltf.scene,associations,modelId,manifestAtLoad.current),[gltf.scene,associations,modelId]);
  const objects=useMemo(()=>componentObjectMap(prepared.scene),[prepared.scene]);
  const groupRef=useRef<THREE.Group>(null),variantInstances=useRef<THREE.Object3D[]>([]),loadReported=useRef(false),dragRef=useRef<DragSnapshot|null>(null),snapCandidateRef=useRef<ActiveSnapCandidate|null>(null),groundDragRef=useRef<GroundDragState|null>(null);
  const publishMeasurements=useCallback(()=>{const root=groupRef.current;if(!root)return;const modelMeasurement=measureRelative(root,root);const selectedMeasurement=selected?measureRelative(root,root,selected):undefined;useMeasurementStore.getState().setMeasurements(modelMeasurement,selectedMeasurement&&selected?{...selectedMeasurement,componentId:selected}:undefined);},[selected]);

  useEffect(()=>setPreparedAsset(prepared.manifest,prepared.configuration),[prepared,setPreparedAsset]);
  useEffect(()=>{if(loadReported.current||loadStartedAt<=0)return;loadReported.current=true;void reportViewerLoad(performance.now()-loadStartedAt);},[loadStartedAt]);
  useEffect(()=>{retainOwnedObject3D(prepared.scene);return()=>releaseOwnedObject3D(prepared.scene);},[prepared.scene]);
  useEffect(()=>{setCandidate(undefined);setGroundBarrier(undefined);snapCandidateRef.current=null;groundDragRef.current=null;},[selected,setCandidate,setGroundBarrier]);
  useEffect(()=>{
    if(!configuration||!manifest)return;
    prepared.scene.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const id=object.userData.__componentId as string|undefined;if(!id)return;const state=configuration.components[id];if(!state)return;const baseScale=object.userData.__baseScale as number[],basePosition=object.userData.__basePosition as number[],baseRotation=object.userData.__baseRotation as number[];object.scale.set(baseScale[0]*state.dimensionsMm.width/state.originalDimensionsMm.width,baseScale[1]*state.dimensionsMm.height/state.originalDimensionsMm.height,baseScale[2]*state.dimensionsMm.depth/state.originalDimensionsMm.depth);object.position.set(basePosition[0]+state.transform.position[0]/1000,basePosition[1]+state.transform.position[1]/1000,basePosition[2]+state.transform.position[2]/1000);object.rotation.set(baseRotation[0]+state.transform.rotation[0],baseRotation[1]+state.transform.rotation[1],baseRotation[2]+state.transform.rotation[2]);object.visible=state.visible&&!state.deleted&&!state.variantId;const preset=state.materialId?demoMaterials.find(item=>item.id===state.materialId):undefined,materials:THREE.Material[]=Array.isArray(object.material)?object.material:[object.material],bases=object.userData.__baseMaterials as BaseMaterialState[];for(const[index,material]of materials.entries()){if(!(material instanceof THREE.MeshStandardMaterial))continue;const base=bases?.[index];if(base){material.color.set(`#${base.color}`);material.roughness=base.roughness;material.metalness=base.metalness;}if(preset?.baseColor)material.color.set(preset.baseColor);if(preset){material.roughness=preset.roughness;material.metalness=preset.metalness;}if(state.color)material.color.set(state.color);}});
  },[configuration,manifest,prepared.scene]);
  useEffect(()=>{let cancelled=false;for(const item of variantInstances.current){item.removeFromParent();disposeObject3D(item);}variantInstances.current=[];if(!configuration)return()=>{cancelled=true;};const tasks=Object.entries(configuration.components).filter(([,state])=>Boolean(state.variantId)&&state.visible&&!state.deleted).map(async([id,state])=>{const variant=state.variantId?variants[state.variantId]:undefined;if(!variant)return;let sourceObject:THREE.Object3D|undefined;prepared.scene.traverse(object=>{if(object.userData.__componentId===id)sourceObject=object;});if(!sourceObject?.parent)return;const instance=await variantScene(variant.signedUrl);if(cancelled){disposeObject3D(instance);return;}instance.name=`Variant ${variant.name}`;instance.traverse(object=>{object.userData.__componentId=id;});sourceObject.parent.add(instance);instance.position.copy(sourceObject.position);instance.rotation.copy(sourceObject.rotation);const box=new THREE.Box3().setFromObject(instance),size=new THREE.Vector3();box.getSize(size);if(variant.dimensionPolicy==='AUTO_FIT'&&size.x>0&&size.y>0&&size.z>0)instance.scale.set(state.dimensionsMm.width/1000/size.x*state.transform.scale[0],state.dimensionsMm.height/1000/size.y*state.transform.scale[1],state.dimensionsMm.depth/1000/size.z*state.transform.scale[2]);variantInstances.current.push(instance);highlight(instance,useEditorStore.getState().selected);});void Promise.all(tasks).then(()=>{if(!cancelled)requestAnimationFrame(publishMeasurements);});return()=>{cancelled=true;for(const item of variantInstances.current){item.removeFromParent();disposeObject3D(item);}variantInstances.current=[];};},[configuration,variants,prepared.scene,publishMeasurements]);
  useEffect(()=>{highlight(prepared.scene,selected);for(const instance of variantInstances.current)highlight(instance,selected);},[prepared.scene,selected]);
  useEffect(()=>{if(!groupRef.current||!configuration)return;const transform=configuration.placement.transform;groupRef.current.position.fromArray(transform.position);groupRef.current.rotation.set(...transform.rotation);groupRef.current.scale.fromArray(transform.scale);},[configuration?.placement.transform]);
  useEffect(()=>{const frame=requestAnimationFrame(publishMeasurements);return()=>cancelAnimationFrame(frame);},[configuration,selected,publishMeasurements]);

  const selectionTarget=useMemo(()=>findComponentObject(prepared.scene,selected),[prepared.scene,selected]);
  const selectedDefinition=manifest?.components.find(item=>item.id===selected),selectedState=selected?configuration?.components[selected]:undefined,selectionVisible=Boolean(selectedState?.visible&&!selectedState.deleted);
  const selectedAnchors=(manifest?.anchors??[]).filter(anchor=>anchor.componentId===selected&&anchor.snapEnabled);
  const candidateTarget=candidateState?findComponentObject(prepared.scene,candidateState.targetComponentId):undefined;
  const translationSnap=gridSnapEnabled?Math.max(gridStepMm/1000,1e-9):undefined;
  const rotationSnap=gridSnapEnabled?THREE.MathUtils.degToRad(rotationSnapDeg):undefined;

  const updateSnapCandidate=useCallback(()=>{
    if(!snapEnabled||componentMode!=='translate'||!manifest||!configuration||!selectedDefinition||!selectionTarget){snapCandidateRef.current=null;setCandidate(undefined);return;}
    const candidate=findNearestAnchorCandidate({sourceComponentId:selectedDefinition.id,sourceObject:selectionTarget,manifest,configuration,objects});
    if(!candidate){snapCandidateRef.current=null;setCandidate(undefined);return;}
    const targetPoint=anchorWorldPosition(candidate.targetObject,candidate.targetAnchor);const perPixel=worldPerPixel(camera,canvasSize.height,targetPoint);const indicatorDistance=perPixel*NEAREST_INDICATOR_PIXELS;
    if(candidate.distanceWorld>indicatorDistance){snapCandidateRef.current=null;setCandidate(undefined);return;}
    const ready=candidate.compatible&&candidate.distanceWorld<=perPixel*SNAP_PIXELS;
    snapCandidateRef.current={...candidate,ready};
    setCandidate({sourceComponentId:selectedDefinition.id,sourceAnchorId:candidate.sourceAnchor.id,sourceAnchorName:candidate.sourceAnchor.name??candidate.sourceAnchor.id,targetComponentId:candidate.targetComponentId,targetComponentName:candidate.targetComponentName,targetAnchorId:candidate.targetAnchor.id,targetAnchorName:candidate.targetAnchor.name??candidate.targetAnchor.id,gapMm:candidate.distanceWorld*1000,compatible:candidate.compatible,ready});
  },[snapEnabled,componentMode,manifest,configuration,selectedDefinition,selectionTarget,objects,camera,canvasSize.height,setCandidate]);

  const updateGroundBarrier=useCallback(()=>{
    const drag=groundDragRef.current;
    if(componentMode!=='translate'||!drag||!selectionTarget||!selectedDefinition){setGroundBarrier(undefined);return;}
    selectionTarget.updateWorldMatrix(true,true);
    const box=new THREE.Box3().setFromObject(selectionTarget);
    if(box.isEmpty()){setGroundBarrier(undefined);return;}
    const result=resolveGroundBarrier(box.min.y,drag.breakDistanceWorld,drag.released);
    drag.released=result.released;
    if(result.correctionY>0)moveObjectWorldY(selectionTarget,result.correctionY);
    if(result.phase==='clear'){setGroundBarrier(undefined);return;}
    setGroundBarrier({phase:result.phase,componentId:selectedDefinition.id,componentName:selectedDefinition.name,penetrationMm:result.penetration*1000,thresholdMm:drag.breakDistanceWorld*1000,progress:result.progress});
  },[componentMode,selectionTarget,selectedDefinition,setGroundBarrier]);

  const updateComponentDrag=useCallback(()=>{updateGroundBarrier();updateSnapCandidate();},[updateGroundBarrier,updateSnapCandidate]);

  const model=<group ref={groupRef} onPointerDown={event=>{event.stopPropagation();let object:THREE.Object3D|null=event.object;while(object&&!object.userData.__componentId)object=object.parent;const id=object?.userData.__componentId as string|undefined;if(id)select(id);}}><primitive object={prepared.scene}/></group>;
  const indicator=<SelectionIndicator target={selectionTarget} label={selectedDefinition?.name} visible={selectionVisible} showLabel={labelMode==='selected'}/>;
  const componentLabels=<ComponentLabels objects={objects} manifest={manifest} configuration={configuration} mode={labelMode} selected={selected}/>;
  const proximity=candidateState?<ProximityIndicator target={candidateTarget} label={candidateState.targetComponentName} gapMm={candidateState.gapMm} compatible={candidateState.compatible} ready={candidateState.ready}/>:null;
  const anchorMarkers=<AnchorMarkers target={selectionTarget} anchors={selectedAnchors} visible={Boolean(snapEnabled&&phase==='EDITOR'&&configuration?.placement.locked&&componentMode==='translate'&&selectionVisible)}/>;
  const cameraController=<DccCameraController selectedTarget={selectionTarget} modelTarget={groupRef.current??undefined} request={frameRequest}/>;
  if(phase==='EDITOR'&&!configuration?.placement.locked)return <><TransformControls mode={placementMode} space={transformSpace} size={gizmoSize} translationSnap={translationSnap} rotationSnap={rotationSnap} onObjectChange={()=>{const object=groupRef.current;if(!object)return;setPlacementTransform({position:object.position.toArray() as[number,number,number],rotation:[object.rotation.x,object.rotation.y,object.rotation.z],scale:object.scale.toArray() as[number,number,number]});}}>{model}</TransformControls>{indicator}{componentLabels}{cameraController}</>;

  const componentControls=phase==='EDITOR'&&configuration?.placement.locked&&selectedDefinition?.editable&&selectedState&&selectionTarget?<TransformControls
    object={selectionTarget}
    mode={componentMode}
    space={transformSpace}
    size={gizmoSize}
    translationSnap={translationSnap}
    rotationSnap={rotationSnap}
    showX={componentMode!=='scale'||selectedDefinition.editableAxes.x}
    showY={componentMode!=='scale'||selectedDefinition.editableAxes.y}
    showZ={componentMode!=='scale'||selectedDefinition.editableAxes.z}
    onMouseDown={()=>{
      setCandidate(undefined);setGroundBarrier(undefined);snapCandidateRef.current=null;
      dragRef.current={position:selectionTarget.position.clone(),rotation:selectionTarget.rotation.clone(),scale:selectionTarget.scale.clone(),state:structuredClone(selectedState)};
      if(componentMode==='translate'){
        selectionTarget.updateWorldMatrix(true,true);
        const box=new THREE.Box3().setFromObject(selectionTarget);const center=box.isEmpty()?selectionTarget.getWorldPosition(new THREE.Vector3()):box.getCenter(new THREE.Vector3());
        groundDragRef.current={released:!box.isEmpty()&&box.min.y<0,breakDistanceWorld:Math.max(worldPerPixel(camera,canvasSize.height,center)*GROUND_BREAK_PIXELS,1e-5)};
      }else groundDragRef.current=null;
    }}
    onObjectChange={updateComponentDrag}
    onMouseUp={()=>{
      const start=dragRef.current;if(!start)return;
      let finalPosition=selectionTarget.position.clone(),finalRotation=selectionTarget.rotation.clone();const finalScale=selectionTarget.scale.clone();const snap=snapCandidateRef.current;
      if(componentMode==='translate'&&snapEnabled&&snap?.ready){const resolved=snappedLocalTransform(selectionTarget,snap.sourceAnchor,snap.targetObject,snap.targetAnchor);finalPosition=resolved.position;if(snap.sourceAnchor.alignRotation&&snap.targetAnchor.alignRotation)finalRotation=resolved.rotation;}
      selectionTarget.position.copy(start.position);selectionTarget.rotation.copy(start.rotation);selectionTarget.scale.copy(start.scale);
      const actions:EditorAction[]=[];
      if(componentMode==='translate'){
        (['X','Y','Z'] as const).forEach((axis,index)=>actions.push({type:'SET_POSITION',componentId:selectedDefinition.id,axis,value:start.state.transform.position[index]+(finalPosition.getComponent(index)-start.position.getComponent(index))*1000,source:'MANUAL'}));
        if(snap?.ready&&snap.sourceAnchor.alignRotation&&snap.targetAnchor.alignRotation)(['X','Y','Z'] as const).forEach((axis,index)=>actions.push({type:'SET_ROTATION',componentId:selectedDefinition.id,axis,value:start.state.transform.rotation[index]+normalizeAngle(finalRotation.toArray()[index] as number-(start.rotation.toArray()[index] as number)),source:'MANUAL'}));
        if(snapEnabled&&snap?.ready)actions.push({type:'ATTACH_COMPONENT',componentId:selectedDefinition.id,sourceAnchorId:snap.sourceAnchor.id,targetComponentId:snap.targetComponentId,targetAnchorId:snap.targetAnchor.id,createdBy:'SNAP',source:'MANUAL'});
      }else if(componentMode==='rotate'){
        (['X','Y','Z'] as const).forEach((axis,index)=>actions.push({type:'SET_ROTATION',componentId:selectedDefinition.id,axis,value:start.state.transform.rotation[index]+normalizeAngle(finalRotation.toArray()[index] as number-(start.rotation.toArray()[index] as number)),source:'MANUAL'}));
      }else if(selectedDefinition.scalingMode==='AXIS_SCALE'){
        const inverse={x:'width',y:'height',z:'depth'} as const;(['x','y','z'] as const).forEach((axis,index)=>{if(!selectedDefinition.editableAxes[axis])return;const key=inverse[axis],factor=finalScale.getComponent(index)/Math.max(Math.abs(start.scale.getComponent(index)),1e-9);actions.push({type:'SET_DIMENSION',componentId:selectedDefinition.id,axis:key.toUpperCase() as 'WIDTH'|'HEIGHT'|'DEPTH',valueMm:Math.max(.001,start.state.dimensionsMm[key]*factor),source:'MANUAL'});});
      }
      dragRef.current=null;groundDragRef.current=null;snapCandidateRef.current=null;setCandidate(undefined);setGroundBarrier(undefined);if(actions.length)dispatchBatch(actions,snap?.ready?`Snap ${selectedDefinition.name} to ${snap.targetComponentName}`:`Direct ${componentMode} ${selectedDefinition.name}`);
    }}
  />:null;
  return <>{model}{componentControls}{indicator}{componentLabels}{proximity}{anchorMarkers}{cameraController}</>;
}

function NavigationAids(){return <><Grid infiniteGrid followCamera args={[10,10]} cellSize={1} sectionSize={10} fadeDistance={100000} fadeStrength={1} fadeFrom={1} side={THREE.DoubleSide}/><axesHelper args={[10]}/><GizmoHelper alignment="bottom-right" margin={[80,80]}><GizmoViewport axisColors={['#e55757','#58b86b','#4b83e6']} labelColor="white"/></GizmoHelper></>;}

export default function ModelViewport(){
  const assetUrl=useEditorStore(state=>state.assetUrl),resetSnap=useSnapInteractionStore(state=>state.reset);
  const loadStartedAt=useMemo(()=>assetUrl&&typeof performance!=='undefined'?performance.now():0,[assetUrl]);
  useEffect(()=>{useMeasurementStore.getState().reset();resetSnap();},[assetUrl,resetSnap]);
  return <Canvas dpr={[1,2]} gl={{powerPreference:'high-performance'}} camera={{position:[4,3,5],fov:45,near:.01,far:1000000}} shadows onPointerMissed={()=>useEditorStore.getState().select(undefined)}><ambientLight intensity={1.25}/><directionalLight position={[4,7,5]} intensity={2.2} castShadow/><NavigationAids/><OrbitControls makeDefault enableDamping dampingFactor={.08} screenSpacePanning minDistance={.02} maxDistance={250000}/>{assetUrl?<Suspense fallback={null}><Bounds key={assetUrl} fit clip margin={1.2}><LoadedModel url={assetUrl} loadStartedAt={loadStartedAt}/></Bounds></Suspense>:null}</Canvas>;
}
