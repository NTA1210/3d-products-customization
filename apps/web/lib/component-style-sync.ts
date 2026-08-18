import type {EditorAction} from '@product3d/action-engine';
import type {ComponentManifest,ModelManifest} from '@product3d/model-schema';

const STYLE_SYNC_ACTION_TYPES=new Set<EditorAction['type']>(['SET_MATERIAL','SET_COLOR','REPLACE_COMPONENT']);

export function normalizeComponentLabels(labels:readonly string[]|undefined):string[]{
  return [...new Set((labels??[]).map(label=>label.trim().toLowerCase()).filter(Boolean))].sort();
}

export function componentLabelKey(labels:readonly string[]|undefined):string|undefined{
  const normalized=normalizeComponentLabels(labels);
  return normalized.length?normalized.join('\u001f'):undefined;
}

export function exactLabelStyleGroup(manifest:ModelManifest,componentId:string):ComponentManifest[]{
  const source=manifest.components.find(component=>component.id===componentId);
  const key=componentLabelKey(source?.labels);
  if(!key)return source?[source]:[];
  return manifest.components.filter(component=>componentLabelKey(component.labels)===key);
}

export function expandManualStyleSyncAction(action:EditorAction,manifest:ModelManifest):EditorAction[]{
  if(action.source!=='MANUAL'||!STYLE_SYNC_ACTION_TYPES.has(action.type))return[action];
  const group=exactLabelStyleGroup(manifest,action.componentId);
  if(group.length<=1)return[action];
  return group.map(component=>({...action,componentId:component.id} as EditorAction));
}

export function linkedAppearanceSummary(manifest:ModelManifest,componentId:string){
  const group=exactLabelStyleGroup(manifest,componentId);
  const labels=normalizeComponentLabels(manifest.components.find(component=>component.id===componentId)?.labels);
  return{labels,componentIds:group.map(component=>component.id),linkedCount:labels.length?group.length:0};
}
