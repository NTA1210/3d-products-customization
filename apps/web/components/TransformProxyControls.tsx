'use client';

import {useMemo,useRef} from 'react';
import {Html,TransformControls} from '@react-three/drei';
import {useFrame} from '@react-three/fiber';
import type {EditorAction} from '@product3d/action-engine';
import type {ComponentManifest,ModelConfiguration,TransformState} from '@product3d/model-schema';
import * as THREE from 'three';
import {useEditorStore} from '../lib/store';

type TransformMode='translate'|'rotate';
type TransformSpace='world'|'local';
type ObjectSnapshot={
  id:string;
  object:THREE.Object3D;
  position:THREE.Vector3;
  rotation:THREE.Euler;
  scale:THREE.Vector3;
  worldMatrix:THREE.Matrix4;
  state:ModelConfiguration['components'][string];
};

type ProxyDrag={
  proxyWorld:THREE.Matrix4;
  objects:ObjectSnapshot[];
};

function normalizeAngle(value:number){
  while(value>Math.PI)value-=Math.PI*2;
  while(value<-Math.PI)value+=Math.PI*2;
  return value;
}

function transformAxisAllowed(component:ComponentManifest|undefined,mode:'translate'|'rotate',axis:'x'|'y'|'z'){
  if(!component?.editable)return false;
  return mode==='translate'?(component.positionEditableAxes?.[axis]??true):(component.rotationEditableAxes?.[axis]??true);
}

function setFromWorldMatrix(object:THREE.Object3D,worldMatrix:THREE.Matrix4){
  const local=worldMatrix.clone();
  if(object.parent){
    object.parent.updateWorldMatrix(true,false);
    local.premultiply(object.parent.matrixWorld.clone().invert());
  }
  local.decompose(object.position,object.quaternion,object.scale);
  object.updateMatrixWorld(true);
}

function combinedBounds(objects:THREE.Object3D[]){
  const bounds=new THREE.Box3();
  let found=false;
  for(const object of objects){
    object.updateWorldMatrix(true,true);
    const next=new THREE.Box3().setFromObject(object);
    if(next.isEmpty())continue;
    if(!found){bounds.copy(next);found=true;}else bounds.union(next);
  }
  return found?bounds:undefined;
}

function syncProxy(proxy:THREE.Object3D,objects:THREE.Object3D[],space:TransformSpace){
  const bounds=combinedBounds(objects);
  if(!bounds)return false;
  proxy.position.copy(bounds.getCenter(new THREE.Vector3()));
  if(space==='local'&&objects[0])objects[0].getWorldQuaternion(proxy.quaternion);
  else proxy.quaternion.identity();
  proxy.scale.set(1,1,1);
  proxy.updateMatrixWorld(true);
  return true;
}

function applyProxyDelta(proxy:THREE.Object3D,drag:ProxyDrag){
  proxy.updateWorldMatrix(true,false);
  const delta=proxy.matrixWorld.clone().multiply(drag.proxyWorld.clone().invert());
  for(const snapshot of drag.objects)setFromWorldMatrix(snapshot.object,delta.clone().multiply(snapshot.worldMatrix));
}

function restoreSnapshots(items:ObjectSnapshot[]){
  for(const item of items){
    item.object.position.copy(item.position);
    item.object.rotation.copy(item.rotation);
    item.object.scale.copy(item.scale);
    item.object.updateMatrixWorld(true);
  }
}

function snapshotObject(id:string,object:THREE.Object3D,state:ModelConfiguration['components'][string]):ObjectSnapshot{
  object.updateWorldMatrix(true,false);
  return{
    id,
    object,
    position:object.position.clone(),
    rotation:object.rotation.clone(),
    scale:object.scale.clone(),
    worldMatrix:object.matrixWorld.clone(),
    state:structuredClone(state),
  };
}

export function PlacementTransformProxy({
  rootRef,
  mode,
  space,
  size,
  translationSnap,
  rotationSnap,
  onCommit,
}:{
  rootRef:React.RefObject<THREE.Group|null>;
  mode:TransformMode;
  space:TransformSpace;
  size:number;
  translationSnap?:number;
  rotationSnap?:number;
  onCommit:(transform:TransformState)=>void;
}){
  const proxy=useMemo(()=>new THREE.Object3D(),[]);
  const dragging=useRef(false),drag=useRef<ProxyDrag|undefined>(undefined);

  useFrame(()=>{
    if(dragging.current)return;
    const root=rootRef.current;
    if(root)syncProxy(proxy,[root],space);
  });

  return <>
    <primitive object={proxy}/>
    <TransformControls
      object={proxy}
      mode={mode}
      space={space}
      size={size}
      translationSnap={translationSnap}
      rotationSnap={rotationSnap}
      onMouseDown={()=>{
        const root=rootRef.current;if(!root)return;
        syncProxy(proxy,[root],space);
        proxy.updateWorldMatrix(true,false);
        const placeholderState={
          originalDimensionsMm:{width:1,height:1,depth:1},
          dimensionsMm:{width:1,height:1,depth:1},
          transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},
          visible:true,
          deleted:false,
        } satisfies ModelConfiguration['components'][string];
        drag.current={proxyWorld:proxy.matrixWorld.clone(),objects:[snapshotObject('__placement__',root,placeholderState)]};
        dragging.current=true;
      }}
      onObjectChange={()=>{if(drag.current)applyProxyDelta(proxy,drag.current);}}
      onMouseUp={()=>{
        const root=rootRef.current,current=drag.current;
        if(!root||!current){dragging.current=false;drag.current=undefined;return;}
        const transform:TransformState={
          position:root.position.toArray() as [number,number,number],
          rotation:[root.rotation.x,root.rotation.y,root.rotation.z],
          scale:root.scale.toArray() as [number,number,number],
        };
        dragging.current=false;drag.current=undefined;
        onCommit(transform);
      }}
    />
  </>;
}

export function MultiSelectionTransformProxy({
  objects,
  selectedIds,
  mode,
  space,
  size,
  translationSnap,
  rotationSnap,
}:{
  objects:Map<string,THREE.Object3D>;
  selectedIds:string[];
  mode:'translate'|'rotate'|'scale';
  space:TransformSpace;
  size:number;
  translationSnap?:number;
  rotationSnap?:number;
}){
  const manifest=useEditorStore(state=>state.manifest);
  const configuration=useEditorStore(state=>state.configuration);
  const dispatchBatch=useEditorStore(state=>state.dispatchBatch);
  const proxy=useMemo(()=>new THREE.Object3D(),[]);
  const box=useMemo(()=>new THREE.Box3(),[]);
  const helper=useMemo(()=>{
    const next=new THREE.Box3Helper(box,'#b185ff');
    const material=next.material as THREE.LineBasicMaterial;
    material.depthTest=false;material.transparent=true;material.opacity=.95;next.renderOrder=1001;
    return next;
  },[box]);
  const labelRef=useRef<THREE.Group>(null);
  const dragging=useRef(false),drag=useRef<ProxyDrag|undefined>(undefined);
  const transformMode=mode==='rotate'?'rotate':'translate';

  const movableIds=useMemo(()=>selectedIds.filter(id=>{
    const definition=manifest?.components.find(item=>item.id===id);
    const state=configuration?.components[id];
    const hasAxis=mode==='scale'?false:(['x','y','z'] as const).some(axis=>transformAxisAllowed(definition,transformMode,axis));
    return Boolean(definition?.editable&&state?.visible&&!state.deleted&&objects.get(id)&&hasAxis);
  }),[configuration,manifest,mode,objects,selectedIds,transformMode]);

  const allowedAxes=useMemo(()=>Object.fromEntries((['x','y','z'] as const).map(axis=>[axis,movableIds.length>0&&movableIds.every(id=>transformAxisAllowed(manifest?.components.find(item=>item.id===id),transformMode,axis))])) as Record<'x'|'y'|'z',boolean>,[manifest,movableIds,transformMode]);

  useFrame(()=>{
    const targets=movableIds.map(id=>objects.get(id)).filter((item):item is THREE.Object3D=>Boolean(item));
    const bounds=combinedBounds(targets);
    helper.visible=Boolean(bounds);
    if(labelRef.current)labelRef.current.visible=Boolean(bounds);
    if(!bounds)return;
    box.copy(bounds);
    if(labelRef.current){
      const center=bounds.getCenter(new THREE.Vector3()),sizeVec=bounds.getSize(new THREE.Vector3());
      labelRef.current.position.set(center.x,bounds.max.y+Math.max(sizeVec.length()*.05,.03),center.z);
    }
    if(!dragging.current&&mode!=='scale')syncProxy(proxy,targets,space);
  });

  if(selectedIds.length<2)return null;
  const unsupported=mode==='scale';

  return <>
    <primitive object={helper}/>
    <group ref={labelRef} visible={false}>
      <Html center style={{pointerEvents:'none'}}>
        <div data-testid="multi-selection-indicator" style={{whiteSpace:'nowrap',border:'1px solid #b185ff',borderRadius:7,background:'rgba(24,14,37,.94)',color:'#f3eaff',padding:'5px 8px',fontSize:11,fontWeight:800}}>
          {movableIds.length} transformable / {selectedIds.length} selected{unsupported?' · Group scale disabled':''}
        </div>
      </Html>
    </group>
    {!unsupported&&movableIds.length>0&&Object.values(allowedAxes).some(Boolean)&&<>
      <primitive object={proxy}/>
      <TransformControls
        object={proxy}
        mode={mode}
        space={space}
        size={size}
        translationSnap={translationSnap}
        rotationSnap={rotationSnap}
        showX={allowedAxes.x}
        showY={allowedAxes.y}
        showZ={allowedAxes.z}
        onMouseDown={()=>{
          if(!configuration)return;
          const targets=movableIds.flatMap(id=>{
            const object=objects.get(id),state=configuration.components[id];
            return object&&state?[snapshotObject(id,object,state)]:[];
          });
          if(!targets.length)return;
          syncProxy(proxy,targets.map(item=>item.object),space);
          proxy.updateWorldMatrix(true,false);
          drag.current={proxyWorld:proxy.matrixWorld.clone(),objects:targets};
          dragging.current=true;
        }}
        onObjectChange={()=>{if(drag.current)applyProxyDelta(proxy,drag.current);}}
        onMouseUp={()=>{
          const current=drag.current;
          if(!current||!configuration){dragging.current=false;drag.current=undefined;return;}
          const actions:EditorAction[]=[];
          const movedSet=new Set(current.objects.map(item=>item.id));
          for(const item of current.objects){
            const finalPosition=item.object.position.clone();
            const finalRotation=item.object.rotation.clone();
            (['X','Y','Z'] as const).forEach((axis,index)=>{
              const key=axis.toLowerCase() as 'x'|'y'|'z';
              if(!allowedAxes[key])return;
              const delta=(finalPosition.getComponent(index)-item.position.getComponent(index))*1000;
              if(Math.abs(delta)>1e-6)actions.push({
                type:'SET_POSITION',componentId:item.id,axis,
                value:item.state.transform.position[index]+delta,source:'MANUAL',
              });
            });
            if(mode==='rotate')(['X','Y','Z'] as const).forEach((axis,index)=>{
              const key=axis.toLowerCase() as 'x'|'y'|'z';
              if(!allowedAxes[key])return;
              const delta=normalizeAngle((finalRotation.toArray()[index] as number)-(item.rotation.toArray()[index] as number));
              if(Math.abs(delta)>1e-9)actions.push({
                type:'SET_ROTATION',componentId:item.id,axis,
                value:item.state.transform.rotation[index]+delta,source:'MANUAL',
              });
            });
          }
          const internalAttachments=(configuration.attachments??[]).filter(item=>movedSet.has(item.sourceComponentId)&&movedSet.has(item.targetComponentId));
          for(const attachment of internalAttachments)actions.push({
            type:'ATTACH_COMPONENT',
            componentId:attachment.sourceComponentId,
            sourceAnchorId:attachment.sourceAnchorId,
            targetComponentId:attachment.targetComponentId,
            targetAnchorId:attachment.targetAnchorId,
            createdBy:'MANUAL',source:'MANUAL',
          });
          restoreSnapshots(current.objects);
          dragging.current=false;drag.current=undefined;
          if(actions.length)dispatchBatch(actions,`${mode==='rotate'?'Rotate':'Move'} ${current.objects.length} components`);
        }}
      />
    </>}
  </>;
}
