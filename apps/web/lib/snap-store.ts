'use client';

import {create} from 'zustand';

export type LabelMode='selected'|'all'|'off';
export type GroundBarrierPhase='resisting'|'released';

export type SnapCandidateState={
  sourceComponentId:string;
  sourceAnchorId:string;
  sourceAnchorName:string;
  targetComponentId:string;
  targetComponentName:string;
  targetAnchorId:string;
  targetAnchorName:string;
  gapMm:number;
  compatible:boolean;
  ready:boolean;
};

export type GroundBarrierState={
  phase:GroundBarrierPhase;
  componentId:string;
  componentName:string;
  penetrationMm:number;
  thresholdMm:number;
  progress:number;
};

type SnapInteractionStore={
  snapEnabled:boolean;
  labelMode:LabelMode;
  lastVisibleLabelMode:Exclude<LabelMode,'off'>;
  candidate?:SnapCandidateState;
  groundBarrier?:GroundBarrierState;
  toggleSnap:()=>void;
  toggleLabels:()=>void;
  setLabelMode:(mode:LabelMode)=>void;
  setCandidate:(candidate?:SnapCandidateState)=>void;
  setGroundBarrier:(groundBarrier?:GroundBarrierState)=>void;
  reset:()=>void;
};

export const useSnapInteractionStore=create<SnapInteractionStore>((set)=>({
  snapEnabled:true,
  labelMode:'selected',
  lastVisibleLabelMode:'selected',
  candidate:undefined,
  groundBarrier:undefined,
  toggleSnap:()=>set(state=>({snapEnabled:!state.snapEnabled,candidate:undefined})),
  toggleLabels:()=>set(state=>state.labelMode==='off'
    ?{labelMode:state.lastVisibleLabelMode}
    :{labelMode:'off',lastVisibleLabelMode:state.labelMode}),
  setLabelMode:mode=>set(state=>mode==='off'
    ?{labelMode:'off'}
    :{labelMode:mode,lastVisibleLabelMode:mode}),
  setCandidate:candidate=>set({candidate}),
  setGroundBarrier:groundBarrier=>set({groundBarrier}),
  reset:()=>set({candidate:undefined,groundBarrier:undefined}),
}));
