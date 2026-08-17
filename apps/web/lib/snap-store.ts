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
  /** Resolved assist state consumed by the viewport. */
  snapEnabled:boolean;
  /** Persistent magnetic positioning requested by the user. */
  persistentSnapEnabled:boolean;
  /** Temporary Ctrl-held positioning assist. */
  temporarySnapActive:boolean;
  /** Explicit assembly intent. A successful snap may create ATTACH_COMPONENT only in this mode. */
  attachMode:boolean;
  labelMode:LabelMode;
  lastVisibleLabelMode:Exclude<LabelMode,'off'>;
  candidate?:SnapCandidateState;
  groundBarrier?:GroundBarrierState;
  toggleSnap:()=>void;
  setTemporarySnap:(active:boolean)=>void;
  toggleAttachMode:()=>void;
  setAttachMode:(active:boolean)=>void;
  toggleLabels:()=>void;
  setLabelMode:(mode:LabelMode)=>void;
  setCandidate:(candidate?:SnapCandidateState)=>void;
  setGroundBarrier:(groundBarrier?:GroundBarrierState)=>void;
  reset:()=>void;
};

function resolvedSnap(persistentSnapEnabled:boolean,temporarySnapActive:boolean,attachMode:boolean){
  return persistentSnapEnabled||temporarySnapActive||attachMode;
}

export const useSnapInteractionStore=create<SnapInteractionStore>((set)=>({
  snapEnabled:false,
  persistentSnapEnabled:false,
  temporarySnapActive:false,
  attachMode:false,
  labelMode:'selected',
  lastVisibleLabelMode:'selected',
  candidate:undefined,
  groundBarrier:undefined,
  toggleSnap:()=>set(state=>{
    const persistentSnapEnabled=!state.persistentSnapEnabled;
    return{
      persistentSnapEnabled,
      snapEnabled:resolvedSnap(persistentSnapEnabled,state.temporarySnapActive,state.attachMode),
      candidate:undefined,
    };
  }),
  setTemporarySnap:temporarySnapActive=>set(state=>({
    temporarySnapActive,
    snapEnabled:resolvedSnap(state.persistentSnapEnabled,temporarySnapActive,state.attachMode),
    ...(!temporarySnapActive&&!state.persistentSnapEnabled&&!state.attachMode?{candidate:undefined}:{}),
  })),
  toggleAttachMode:()=>set(state=>{
    const attachMode=!state.attachMode;
    return{
      attachMode,
      snapEnabled:resolvedSnap(state.persistentSnapEnabled,state.temporarySnapActive,attachMode),
      candidate:undefined,
    };
  }),
  setAttachMode:attachMode=>set(state=>({
    attachMode,
    snapEnabled:resolvedSnap(state.persistentSnapEnabled,state.temporarySnapActive,attachMode),
    ...(!attachMode&&!state.persistentSnapEnabled&&!state.temporarySnapActive?{candidate:undefined}:{}),
  })),
  toggleLabels:()=>set(state=>state.labelMode==='off'
    ?{labelMode:state.lastVisibleLabelMode}
    :{labelMode:'off',lastVisibleLabelMode:state.labelMode}),
  setLabelMode:mode=>set(state=>mode==='off'
    ?{labelMode:'off'}
    :{labelMode:mode,lastVisibleLabelMode:mode}),
  setCandidate:candidate=>set({candidate}),
  setGroundBarrier:groundBarrier=>set({groundBarrier}),
  reset:()=>set({candidate:undefined,groundBarrier:undefined,temporarySnapActive:false}),
}));
