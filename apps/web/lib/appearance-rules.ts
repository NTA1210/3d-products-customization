import type {EditorAction} from '@product3d/action-engine';
import type {AppearanceRule,AppearanceSyncChannel,ComponentManifest,ModelManifest} from '@product3d/model-schema';

const ACTION_CHANNEL:Partial<Record<EditorAction['type'],AppearanceSyncChannel>>={
  SET_MATERIAL:'MATERIAL',
  SET_COLOR:'COLOR',
};

function normalizeToken(value:string){return value.trim().toLowerCase();}

export function normalizeComponentAttributes(attributes:Record<string,string>|undefined):Record<string,string>{
  const normalized:Record<string,string>={};
  for(const[key,value]of Object.entries(attributes??{})){
    const nextKey=normalizeToken(key),nextValue=normalizeToken(value);
    if(nextKey&&nextValue)normalized[nextKey]=nextValue;
  }
  return Object.fromEntries(Object.entries(normalized).sort(([a],[b])=>a.localeCompare(b)));
}

export function componentMatchesAppearanceRule(component:ComponentManifest,rule:AppearanceRule):boolean{
  if(!rule.enabled)return false;
  const expected=normalizeComponentAttributes(rule.match);
  const entries=Object.entries(expected);
  if(!entries.length)return false;
  const actual=normalizeComponentAttributes(component.attributes);
  return entries.every(([key,value])=>actual[key]===value);
}

export function appearanceRuleMembers(manifest:ModelManifest,rule:AppearanceRule):ComponentManifest[]{
  if(!rule.enabled)return[];
  return manifest.components.filter(component=>componentMatchesAppearanceRule(component,rule));
}

export function matchingAppearanceRules(manifest:ModelManifest,componentId:string,channel?:AppearanceSyncChannel):AppearanceRule[]{
  const component=manifest.components.find(item=>item.id===componentId);
  if(!component)return[];
  return(manifest.appearanceRules??[]).filter(rule=>
    componentMatchesAppearanceRule(component,rule)&&(!channel||rule.syncChannels.includes(channel)),
  );
}

export function appearanceRuleTargets(manifest:ModelManifest,componentId:string,channel:AppearanceSyncChannel):ComponentManifest[]{
  const rules=matchingAppearanceRules(manifest,componentId,channel);
  if(!rules.length){
    const source=manifest.components.find(component=>component.id===componentId);
    return source?[source]:[];
  }
  const ids=new Set<string>([componentId]);
  for(const rule of rules)for(const member of appearanceRuleMembers(manifest,rule))ids.add(member.id);
  return manifest.components.filter(component=>ids.has(component.id));
}

export function expandManualAppearanceRuleAction(action:EditorAction,manifest:ModelManifest):EditorAction[]{
  const channel=ACTION_CHANNEL[action.type];
  if(action.source!=='MANUAL'||!channel)return[action];
  const targets=appearanceRuleTargets(manifest,action.componentId,channel);
  if(targets.length<=1)return[action];
  return targets.map(component=>({...action,componentId:component.id} as EditorAction));
}

export function appearanceRuleSummary(manifest:ModelManifest,componentId:string){
  const component=manifest.components.find(item=>item.id===componentId);
  const rules=matchingAppearanceRules(manifest,componentId).map(rule=>({
    id:rule.id,
    name:rule.name,
    syncChannels:[...rule.syncChannels],
    componentIds:appearanceRuleMembers(manifest,rule).map(item=>item.id),
  }));
  return{
    attributes:normalizeComponentAttributes(component?.attributes),
    rules,
    materialComponentIds:appearanceRuleTargets(manifest,componentId,'MATERIAL').map(item=>item.id),
    colorComponentIds:appearanceRuleTargets(manifest,componentId,'COLOR').map(item=>item.id),
  };
}
