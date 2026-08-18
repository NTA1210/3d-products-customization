'use client';

import {create} from 'zustand';
import type {
  AnchorDefinition,
  AppearanceRule,
  AssetAnalysis,
  ComponentManifest,
  ComponentRole,
  DependencyRule,
  MaterialPreset,
  ModelConfiguration,
  ModelManifest,
  TransformState,
} from '@product3d/model-schema';
import type {EditorAction} from '@product3d/action-engine';
import type {PresetRule} from '@product3d/preset-engine';
import {applyPresetRules} from '@product3d/preset-engine';
import {applyAction,applyActions} from '@product3d/editor-core';
import {demoMaterials,replaceRuntimeMaterials} from './materials';
import {useSnapInteractionStore} from './snap-store';
import type {RuntimeVariant} from './catalog-api';
import {resetProductConfiguration} from './configuration-presets';
import {expandManualAppearanceRuleAction} from './appearance-rules';

type Phase='EMPTY'|'PREPARE'|'EDITOR';
type TransformMode='translate'|'rotate'|'scale';
type Snapshot={configuration:ModelConfiguration;label:string};

function mergeDetectedAnchors(saved:ModelManifest,detected:ModelManifest):ModelManifest{
  if(saved.anchors?.length)return saved;
  const detectedByComponent=new Map(detected.components.map(component=>[component.id,component.anchorIds]));
  return{
    ...saved,
    anchors:detected.anchors??[],
    components:saved.components.map(component=>({
      ...component,
      anchorIds:component.anchorIds.length?component.anchorIds:(detectedByComponent.get(component.id)??[]),
    })),
  };
}

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
  materials:MaterialPreset[];
  setUploadedAsset:(a:string,u:string)=>void;
  setAssetAnalysis:(a:string,x:AssetAnalysis)=>void;
  setPreparedAsset:(m:ModelManifest,c:ModelConfiguration)=>void;
  hydrateAsset:(p:{assetId:string;assetName:string;assetUrl:string;analysis?:AssetAnalysis;manifest?:ModelManifest})=>void;
  hydrateProject:(p:{projectId:string;assetId:string;assetName:string;assetUrl:string;manifest:ModelManifest;configuration:ModelConfiguration;analysis?:AssetAnalysis})=>void;
  setProjectId:(id?:string)=>void;
  replaceManifest:(m:ModelManifest)=>boolean;
  setDependencies:(d:DependencyRule[])=>void;
  setAppearanceRules:(rules:AppearanceRule[])=>void;
  setPrepareVisibility:(id:string,v:boolean)=>void;
  setVariants:(v:RuntimeVariant[])=>void;
  setMaterials:(v:MaterialPreset[])=>void;
  select:(id?:string)=>void;
  patchComponentDefinition:(id:string,p:Partial<ComponentManifest>)=>void;
  patchAnchor:(id:string,p:Partial<AnchorDefinition>)=>void;
  addAnchor:(anchor:AnchorDefinition)=>void;
  removeAnchor:(id:string)=>void;
  setRole:(id:string,r:ComponentRole)=>void;
  openEditor:()=>void;
  toggleLock:()=>void;
  setPlacementMode:(m:Exclude<TransformMode,'scale'>)=>void;
  setComponentMode:(m:TransformMode)=>void;
  setPlacementTransform:(t:TransformState)=>void;
  dispatch:(a:EditorAction,l?:string)=>boolean;
  dispatchBatch:(actions:EditorAction[],label:string)=>boolean;
  applyRules:(rules:PresetRule[],source:'STYLE'|'PRESET',label:string,id?:string)=>boolean;
  resetModel:()=>boolean;
  resetPreset:(rules:PresetRule[],id:string,label?:string)=>boolean;
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
  materials:[...demoMaterials],
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
      const mergedManifest=mergeDetectedAnchors(state.manifest,manifest);
      return{manifest:mergedManifest,configuration,selected:state.selected??mergedManifest.components[0]?.id};
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
  setAppearanceRules:appearanceRules=>set(state=>state.manifest?{manifest:{...state.manifest,appearanceRules}}:{}),
  setPrepareVisibility:(id,visible)=>set(state=>!state.configuration?.components[id]?{}:{
    configuration:{...state.configuration,components:{...state.configuration.components,[id]:{...state.configuration.components[id],visible}}},
  }),
  setVariants:items=>set(state=>({variants:{...state.variants,...Object.fromEntries(items.map(item=>[item.id,item]))}})),
  setMaterials:items=>{
    if(!items.length)return;
    replaceRuntimeMaterials(items);
    set({materials:items.map(item=>structuredClone(item))});
  },
  select:selected=>set({selected}),
  patchComponentDefinition:(id,patch)=>set(state=>!state.manifest?{}:{
    manifest:{...state.manifest,components:state.manifest.components.map(item=>item.id===id?{...item,...patch}:item)},
  }),
  patchAnchor:(id,patch)=>set(state=>!state.manifest?{}:{
    manifest:{...state.manifest,anchors:(state.manifest.anchors??[]).map(anchor=>anchor.id===id?{...anchor,...patch}:anchor)},
  }),
  addAnchor:anchor=>set(state=>{
    if(!state.manifest)return{};
    return{
      manifest:{
        ...state.manifest,
        anchors:[...(state.manifest.anchors??[]).filter(item=>item.id!==anchor.id),anchor],
        components:state.manifest.components.map(component=>component.id===anchor.componentId
          ?{...component,anchorIds:[...new Set([...component.anchorIds,anchor.id])]}
          :component),
      },
    };
  }),
  removeAnchor:id=>set(state=>{
    if(!state.manifest)return{};
    return{
      manifest:{
        ...state.manifest,
        anchors:(state.manifest.anchors??[]).filter(anchor=>anchor.id!==id),
        components:state.manifest.components.map(component=>({...component,anchorIds:component.anchorIds.filter(anchorId=>anchorId!==id)})),
      },
      configuration:state.configuration?{
        ...state.configuration,
        attachments:(state.configuration.attachments??[]).filter(item=>item.sourceAnchorId!==id&&item.targetAnchorId!==id),
      }:state.configuration,
    };
  }),
  setRole:(id,role)=>get().patchComponentDefinition(id,{role}),
  openEditor:()=>set(state=>state.manifest&&state.configuration?{
    phase:'EDITOR',configuration:{...state.configuration,manifestVersion:state.manifest.version,attachments:state.configuration.attachments??[]},error:undefined,
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
    const linkedActions=expandManualAppearanceRuleAction(action,state.manifest);
    const result=linkedActions.length===1
      ?applyAction(linkedActions[0],state.manifest,state.configuration,{materials:state.materials,variants:Object.values(state.variants)})
      :applyActions(linkedActions,state.manifest,state.configuration,{materials:state.materials,variants:Object.values(state.variants)});
    if(!result.ok){
      set({error:linkedActions.length>1?`Appearance rule sync failed: ${result.message}`:result.message});
      return false;
    }
    const historyLabel=linkedActions.length>1?`${label??action.type} · synced ${linkedActions.length} components`:(label??action.type);
    set({configuration:result.configuration,undoStack:[...state.undoStack,{configuration:before,label:historyLabel}],redoStack:[],error:undefined});
    return true;
  },
  dispatchBatch:(actions,label)=>{
    const state=get();
    if(!state.manifest||!state.configuration||!actions.length)return false;
    const snapIntent=useSnapInteractionStore.getState();
    const hasSnapAttachment=actions.some(action=>action.type==='ATTACH_COMPONENT'&&action.createdBy==='SNAP');
    const resolvedActions=actions.filter(action=>action.type!=='ATTACH_COMPONENT'||action.createdBy!=='SNAP'||snapIntent.attachMode);
    if(!resolvedActions.length)return false;
    const before=structuredClone(state.configuration);
    const result=applyActions(resolvedActions,state.manifest,state.configuration,{materials:state.materials,variants:Object.values(state.variants)});
    if(!result.ok){set({error:result.message});return false;}
    set({configuration:result.configuration,undoStack:[...state.undoStack,{configuration:before,label}],redoStack:[],error:undefined});
    if(hasSnapAttachment&&snapIntent.attachMode)useSnapInteractionStore.getState().setAttachMode(false);
    return true;
  },
  applyRules:(rules,source,label,id)=>{
    const state=get();
    if(!state.manifest||!state.configuration)return false;
    const before=structuredClone(state.configuration);
    const result=applyPresetRules(rules,source,state.manifest,state.configuration,{materials:state.materials,variants:Object.values(state.variants)});
    if(!result.ok){set({error:result.message});return false;}
    const configuration={...result.configuration,...(source==='STYLE'?{appliedStyleId:id}:{appliedPresetId:id})};
    set({configuration,undoStack:[...state.undoStack,{configuration:before,label}],redoStack:[],error:undefined});
    return true;
  },
  resetModel:()=>{
    const state=get();
    if(!state.configuration)return false;
    const before=structuredClone(state.configuration);
    const configuration=resetProductConfiguration(state.configuration);
    set({configuration,undoStack:[...state.undoStack,{configuration:before,label:'Reset product'}],redoStack:[],error:undefined});
    return true;
  },
  resetPreset:(rules,id,label)=>{
    const state=get();
    if(!state.manifest||!state.configuration)return false;
    const before=structuredClone(state.configuration);
    const baseline=resetProductConfiguration(state.configuration);
    const result=applyPresetRules(rules,'PRESET',state.manifest,baseline,{materials:state.materials,variants:Object.values(state.variants)});
    if(!result.ok){set({error:result.message});return false;}
    const configuration={...result.configuration,appliedPresetId:id};
    set({configuration,undoStack:[...state.undoStack,{configuration:before,label:label??'Reset preset'}],redoStack:[],error:undefined});
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
