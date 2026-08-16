'use client';

import {create} from 'zustand';
import type {
  AssetAnalysis,
  ComponentManifest,
  ComponentRole,
  DependencyRule,
  ModelConfiguration,
  ModelManifest,
  TransformState,
} from '@product3d/model-schema';
import type {EditorAction} from '@product3d/action-engine';
import type {PresetRule} from '@product3d/preset-engine';
import {applyPresetRules} from '@product3d/preset-engine';
import {applyAction,applyActions} from '@product3d/editor-core';
import {demoMaterials} from './materials';
import type {RuntimeVariant} from './catalog-api';

type Phase='EMPTY'|'PREPARE'|'EDITOR';
type TransformMode='translate'|'rotate'|'scale';
type Snapshot={configuration:ModelConfiguration;label:string};

type EditorStore={
  phase:Phase;
  assetName?:string;
  assetUrl?:string;
  assetId?:string;
  projectId?:string;
  analysis?:AssetAnalysis;
  selected?:string;
  manifest?:ModelManifest;
  configuration?:ModelConfiguration;
  placementMode:Exclude<TransformMode,'scale'>;
  componentMode:TransformMode;
  undoStack:Snapshot[];
  redoStack:Snapshot[];
  error?:string;
  variants:Record<string,RuntimeVariant>;
  setUploadedAsset:(a:string,u:string)=>void;
  setAssetAnalysis:(a:string,x:AssetAnalysis)=>void;
  setPreparedAsset:(m:ModelManifest,c:ModelConfiguration)=>void;
  hydrateAsset:(p:{assetId:string;assetName:string;assetUrl:string;analysis?:AssetAnalysis;manifest?:ModelManifest})=>void;
  hydrateProject:(p:{projectId:string;assetId:string;assetName:string;assetUrl:string;manifest:ModelManifest;configuration:ModelConfiguration;analysis?:AssetAnalysis})=>void;
  setProjectId:(id?:string)=>void;
  replaceManifest:(m:ModelManifest)=>boolean;
  setDependencies:(d:DependencyRule[])=>void;
  setPrepareVisibility:(id:string,v:boolean)=>void;
  setVariants:(v:RuntimeVariant[])=>void;
  select:(id?:string)=>void;
  patchComponentDefinition:(id:string,p:Partial<ComponentManifest>)=>void;
  setRole:(id:string,r:ComponentRole)=>void;
  openEditor:()=>void;
  toggleLock:()=>void;
  setPlacementMode:(m:Exclude<TransformMode,'scale'>)=>void;
  setComponentMode:(m:TransformMode)=>void;
  setPlacementTransform:(t:TransformState)=>void;
  dispatch:(a:EditorAction,l?:string)=>boolean;
  dispatchBatch:(actions:EditorAction[],label:string)=>boolean;
  applyRules:(rules:PresetRule[],source:'STYLE'|'PRESET',label:string,id?:string)=>boolean;
  undo:()=>void;
  redo:()=>void;
  clearError:()=>void;
  reset:()=>void;
};

export const useEditorStore=create<EditorStore>((set,get)=>({
  phase:'EMPTY',
  placementMode:'translate',
  componentMode:'translate',
  undoStack:[],
  redoStack:[],
  variants:{},
  setUploadedAsset:(assetName,assetUrl)=>set({
    phase:'PREPARE',assetName,assetUrl,assetId:undefined,projectId:undefined,analysis:undefined,
    selected:undefined,manifest:undefined,configuration:undefined,placementMode:'translate',componentMode:'translate',
    undoStack:[],redoStack:[],variants:{},error:undefined,
  }),
  setAssetAnalysis:(assetId,analysis)=>set({assetId,analysis}),
  setPreparedAsset:(manifest,configuration)=>set(state=>{
    if(state.configuration)return{};
    if(state.manifest){
      const missing=state.manifest.components.filter(component=>!configuration.components[component.id]);
      if(missing.length){
        return{
          manifest,configuration,selected:manifest.components[0]?.id,
          error:`Saved manifest could not map component IDs: ${missing.map(item=>item.id).join(', ')}. Loaded detected components instead.`,
        };
      }
      return{configuration,selected:state.selected??state.manifest.components[0]?.id};
    }
    return{manifest,configuration,selected:manifest.components[0]?.id};
  }),
  hydrateAsset:payload=>set({
    phase:'PREPARE',projectId:undefined,assetId:payload.assetId,assetName:payload.assetName,
    assetUrl:payload.assetUrl,analysis:payload.analysis,manifest:payload.manifest,configuration:undefined,
    selected:payload.manifest?.components[0]?.id,placementMode:'translate',componentMode:'translate',
    undoStack:[],redoStack:[],variants:{},error:undefined,
  }),
  hydrateProject:payload=>set({
    phase:'EDITOR',projectId:payload.projectId,assetId:payload.assetId,assetName:payload.assetName,
    assetUrl:payload.assetUrl,analysis:payload.analysis,manifest:payload.manifest,configuration:payload.configuration,
    selected:payload.manifest.components[0]?.id,placementMode:'translate',componentMode:'translate',
    undoStack:[],redoStack:[],variants:{},error:undefined,
  }),
  setProjectId:projectId=>set({projectId}),
  replaceManifest:manifest=>{
    const state=get();
    if(!state.configuration){set({error:'Load the GLB before importing a manifest.'});return false;}
    const missing=manifest.components.filter(component=>!state.configuration!.components[component.id]);
    if(missing.length){
      set({error:`Imported manifest has unmapped IDs: ${missing.map(item=>item.id).join(', ')}`});
      return false;
    }
    set({manifest,selected:manifest.components[0]?.id,error:undefined});
    return true;
  },
  setDependencies:dependencies=>set(state=>state.manifest?{manifest:{...state.manifest,dependencies}}:{}),
  setPrepareVisibility:(id,visible)=>set(state=>!state.configuration?.components[id]?{}:{
    configuration:{...state.configuration,components:{...state.configuration.components,[id]:{...state.configuration.components[id],visible}}},
  }),
  setVariants:items=>set(state=>({variants:{...state.variants,...Object.fromEntries(items.map(item=>[item.id,item]))}})),
  select:selected=>set({selected}),
  patchComponentDefinition:(id,patch)=>set(state=>!state.manifest?{}:{
    manifest:{...state.manifest,components:state.manifest.components.map(item=>item.id===id?{...item,...patch}:item)},
  }),
  setRole:(id,role)=>get().patchComponentDefinition(id,{role}),
  openEditor:()=>set(state=>state.manifest&&state.configuration?{
    phase:'EDITOR',configuration:{...state.configuration,manifestVersion:state.manifest.version},error:undefined,
  }:{}),
  toggleLock:()=>set(state=>!state.configuration?{}:{
    configuration:{...state.configuration,placement:{...state.configuration.placement,locked:!state.configuration.placement.locked}},
    error:undefined,
  }),
  setPlacementMode:placementMode=>set({placementMode}),
  setComponentMode:componentMode=>set({componentMode}),
  setPlacementTransform:transform=>set(state=>!state.configuration?{}:{
    configuration:{...state.configuration,placement:{...state.configuration.placement,transform}},
  }),
  dispatch:(action,label)=>{
    const state=get();
    if(!state.manifest||!state.configuration)return false;
    const before=structuredClone(state.configuration);
    const result=applyAction(action,state.manifest,state.configuration,{materials:demoMaterials,variants:Object.values(state.variants)});
    if(!result.ok){set({error:result.message});return false;}
    set({configuration:result.configuration,undoStack:[...state.undoStack,{configuration:before,label:label??action.type}],redoStack:[],error:undefined});
    return true;
  },
  dispatchBatch:(actions,label)=>{
    const state=get();
    if(!state.manifest||!state.configuration||!actions.length)return false;
    const before=structuredClone(state.configuration);
    const result=applyActions(actions,state.manifest,state.configuration,{materials:demoMaterials,variants:Object.values(state.variants)});
    if(!result.ok){set({error:result.message});return false;}
    set({configuration:result.configuration,undoStack:[...state.undoStack,{configuration:before,label}],redoStack:[],error:undefined});
    return true;
  },
  applyRules:(rules,source,label,id)=>{
    const state=get();
    if(!state.manifest||!state.configuration)return false;
    const before=structuredClone(state.configuration);
    const result=applyPresetRules(rules,source,state.manifest,state.configuration,{materials:demoMaterials,variants:Object.values(state.variants)});
    if(!result.ok){set({error:result.message});return false;}
    const configuration={...result.configuration,...(source==='STYLE'?{appliedStyleId:id}:{appliedPresetId:id})};
    set({configuration,undoStack:[...state.undoStack,{configuration:before,label}],redoStack:[],error:undefined});
    return true;
  },
  undo:()=>set(state=>{
    if(!state.configuration||!state.undoStack.length)return{};
    const previous=state.undoStack.at(-1)!;
    return{
      configuration:structuredClone(previous.configuration),undoStack:state.undoStack.slice(0,-1),
      redoStack:[...state.redoStack,{configuration:structuredClone(state.configuration),label:previous.label}],error:undefined,
    };
  }),
  redo:()=>set(state=>{
    if(!state.configuration||!state.redoStack.length)return{};
    const next=state.redoStack.at(-1)!;
    return{
      configuration:structuredClone(next.configuration),redoStack:state.redoStack.slice(0,-1),
      undoStack:[...state.undoStack,{configuration:structuredClone(state.configuration),label:next.label}],error:undefined,
    };
  }),
  clearError:()=>set({error:undefined}),
  reset:()=>set({
    phase:'EMPTY',assetName:undefined,assetUrl:undefined,assetId:undefined,projectId:undefined,analysis:undefined,
    selected:undefined,manifest:undefined,configuration:undefined,placementMode:'translate',componentMode:'translate',
    undoStack:[],redoStack:[],variants:{},error:undefined,
  }),
}));