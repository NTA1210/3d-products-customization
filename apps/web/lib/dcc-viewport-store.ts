'use client';

import {create} from 'zustand';
import {createJSONStorage,persist} from 'zustand/middleware';

export type TransformSpace='world'|'local';
export type FrameTarget='selected'|'all';

type FrameRequest={id:number;target:FrameTarget};

type DccViewportStore={
  transformSpace:TransformSpace;
  gridSnapEnabled:boolean;
  gridStepMm:number;
  rotationSnapDeg:number;
  gizmoSize:number;
  frameRequest:FrameRequest;
  altNavigation:boolean;
  setTransformSpace:(space:TransformSpace)=>void;
  toggleTransformSpace:()=>void;
  toggleGridSnap:()=>void;
  setGridStepMm:(value:number)=>void;
  setRotationSnapDeg:(value:number)=>void;
  increaseGizmo:()=>void;
  decreaseGizmo:()=>void;
  requestFrame:(target:FrameTarget)=>void;
  setAltNavigation:(active:boolean)=>void;
};

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));

export const useDccViewportStore=create<DccViewportStore>()(persist((set)=>({
  transformSpace:'world',
  gridSnapEnabled:false,
  gridStepMm:100,
  rotationSnapDeg:15,
  gizmoSize:1,
  frameRequest:{id:0,target:'all'},
  altNavigation:false,
  setTransformSpace:transformSpace=>set({transformSpace}),
  toggleTransformSpace:()=>set(state=>({transformSpace:state.transformSpace==='world'?'local':'world'})),
  toggleGridSnap:()=>set(state=>({gridSnapEnabled:!state.gridSnapEnabled})),
  setGridStepMm:value=>set({gridStepMm:clamp(Number.isFinite(value)?value:100,.001,1_000_000)}),
  setRotationSnapDeg:value=>set({rotationSnapDeg:clamp(Number.isFinite(value)?value:15,.1,180)}),
  increaseGizmo:()=>set(state=>({gizmoSize:clamp(state.gizmoSize+.1,.5,2.5)})),
  decreaseGizmo:()=>set(state=>({gizmoSize:clamp(state.gizmoSize-.1,.5,2.5)})),
  requestFrame:target=>set(state=>({frameRequest:{id:state.frameRequest.id+1,target}})),
  setAltNavigation:altNavigation=>set({altNavigation}),
}),{
  name:'product3d-dcc-viewport-v1',
  storage:createJSONStorage(()=>localStorage),
  partialize:state=>({
    transformSpace:state.transformSpace,
    gridSnapEnabled:state.gridSnapEnabled,
    gridStepMm:state.gridStepMm,
    rotationSnapDeg:state.rotationSnapDeg,
    gizmoSize:state.gizmoSize,
  }) as DccViewportStore,
  merge:(persisted,current)=>({...current,...(persisted as Partial<DccViewportStore>|undefined),frameRequest:{id:0,target:'all'},altNavigation:false}),
}));
