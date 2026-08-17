'use client';

import {create} from 'zustand';

export type LabelMode='selected'|'all'|'off';

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

type SnapInteractionStore={
  snapEnabled:boolean;
  labelMode:LabelMode;
  lastVisibleLabelMode:Exclude<LabelMode,'off'>;
  candidate?:SnapCandidateState;
  toggleSnap:()=>void;
  toggleLabels:()=>void;
  setLabelMode:(mode:LabelMode)=>void;
  setCandidate:(candidate?:SnapCandidateState)=>void;
  reset:()=>void;
};

export const useSnapInteractionStore=create<SnapInteractionStore>((set)=>({
  snapEnabled:true,
  labelMode:'selected',
  lastVisibleLabelMode:'selected',
  candidate:undefined,
  toggleSnap:()=>set(state=>({snapEnabled:!state.snapEnabled,candidate:undefined})),
  toggleLabels:()=>set(state=>state.labelMode==='off'
    ?{labelMode:state.lastVisibleLabelMode}
    :{labelMode:'off',lastVisibleLabelMode:state.labelMode}),
  setLabelMode:mode=>set(state=>mode==='off'
    ?{labelMode:'off'}
    :{labelMode:mode,lastVisibleLabelMode:mode}),
  setCandidate:candidate=>set({candidate}),
  reset:()=>set({candidate:undefined}),
}));
