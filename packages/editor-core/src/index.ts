import type { ComponentVariant,MaterialPreset,ModelConfiguration,ModelManifest,TransformState } from '@product3d/model-schema';
import type { EditorAction } from '@product3d/action-engine';
import { EditorActionSchema } from '@product3d/action-engine';
import { validateAction } from '@product3d/constraint-engine';
import { canApplyMaterial,canApplyVariant } from '@product3d/compatibility-engine';

export type EditorResources={materials?:MaterialPreset[];variants?:ComponentVariant[]};
export type ApplyOptions=EditorResources;
export type ApplyFailure={ok:false;code:string;message:string;action?:EditorAction};
export type ApplySuccess={ok:true;configuration:ModelConfiguration;actions:EditorAction[]};
export type ApplyResult=ApplySuccess|ApplyFailure;

function componentAxis(property:'WIDTH'|'HEIGHT'|'DEPTH'){
  return property.toLowerCase() as 'width'|'height'|'depth';
}

function cloneTransform(transform:TransformState):TransformState{
  return{
    position:[...transform.position] as [number,number,number],
    rotation:[...transform.rotation] as [number,number,number],
    scale:[...transform.scale] as [number,number,number],
  };
}

/**
 * structuredClone preserves aliasing inside an object graph. Older viewer
 * configurations were created with shallow copies of one EMPTY_TRANSFORM,
 * which means multiple components can share the same position/rotation/scale
 * arrays. Normalize transforms after cloning so an action can only mutate the
 * component it targets (unless an explicit manifest dependency says otherwise).
 */
function cloneConfiguration(input:ModelConfiguration):ModelConfiguration{
  const next=structuredClone(input);
  next.placement.transform=cloneTransform(next.placement.transform);
  for(const component of Object.values(next.components)){
    component.transform=cloneTransform(component.transform);
  }
  return next;
}

function applyDependencyRules(before:ModelConfiguration,next:ModelConfiguration,manifest:ModelManifest,action:EditorAction){
  if(action.type!=='SET_DIMENSION'&&action.type!=='SET_POSITION')return;
  const triggerProperty=action.type==='SET_DIMENSION'?action.axis:'POSITION';
  for(const rule of manifest.dependencies.filter(item=>item.sourceComponentId===action.componentId&&item.triggerProperty===triggerProperty)){
    const target=next.components[rule.targetComponentId];
    if(!target)continue;
    let sourceDelta=0;
    if(action.type==='SET_DIMENSION'){
      const key=componentAxis(action.axis);
      sourceDelta=next.components[action.componentId].dimensionsMm[key]-before.components[action.componentId].dimensionsMm[key];
    }else{
      const index={X:0,Y:1,Z:2}[action.axis];
      sourceDelta=next.components[action.componentId].transform.position[index]-before.components[action.componentId].transform.position[index];
    }
    let value=rule.formula.type==='SET_VALUE'?rule.formula.value:sourceDelta*rule.formula.factor;
    if(rule.formula.type==='CLAMPED_DELTA_FACTOR'){
      if(rule.formula.min!==undefined)value=Math.max(rule.formula.min,value);
      if(rule.formula.max!==undefined)value=Math.min(rule.formula.max,value);
    }
    if(rule.targetProperty.startsWith('POSITION_')){
      const index={POSITION_X:0,POSITION_Y:1,POSITION_Z:2}[rule.targetProperty as 'POSITION_X'|'POSITION_Y'|'POSITION_Z'];
      if(rule.formula.type==='SET_VALUE')target.transform.position[index]=value;
      else target.transform.position[index]+=value;
    }else{
      const key=componentAxis(rule.targetProperty as 'WIDTH'|'HEIGHT'|'DEPTH');
      if(rule.formula.type==='SET_VALUE')target.dimensionsMm[key]=value;
      else target.dimensionsMm[key]+=value;
    }
  }
}

export function applyAction(rawAction:unknown,manifest:ModelManifest,input:ModelConfiguration,resources:EditorResources={}):ApplyResult{
  const parsed=EditorActionSchema.safeParse(rawAction);
  if(!parsed.success)return {ok:false,code:'INVALID_ACTION_SCHEMA',message:parsed.error.issues[0]?.message??'Invalid action.'};
  const action=parsed.data;
  const validation=validateAction(action,manifest,input);
  if(!validation.ok)return {...validation,action};
  const definition=manifest.components.find(item=>item.id===action.componentId)!;
  if(action.type==='SET_MATERIAL'){
    const material=resources.materials?.find(item=>item.id===action.materialId);
    if(!material)return {ok:false,code:'MATERIAL_NOT_FOUND',message:'Material ID is not available.',action};
    if(!canApplyMaterial(definition,material))return {ok:false,code:'MATERIAL_INCOMPATIBLE',message:'This material category is not compatible with the selected component.',action};
  }
  if(action.type==='REPLACE_COMPONENT'){
    const variant=resources.variants?.find(item=>item.id===action.variantId);
    if(!variant)return {ok:false,code:'VARIANT_NOT_FOUND',message:'Variant ID is not available.',action};
    if(!canApplyVariant(definition,variant))return {ok:false,code:'VARIANT_INCOMPATIBLE',message:'This variant is not compatible with the selected component.',action};
  }

  const next=cloneConfiguration(input);
  const component=next.components[action.componentId];
  switch(action.type){
    case 'SET_DIMENSION': component.dimensionsMm[componentAxis(action.axis)]=action.valueMm; break;
    case 'SET_MATERIAL': component.materialId=action.materialId; break;
    case 'SET_COLOR': component.color=action.color; break;
    case 'SET_VISIBILITY': component.visible=action.visible; break;
    case 'DELETE_COMPONENT': component.deleted=true;component.visible=false; break;
    case 'RESTORE_COMPONENT': component.deleted=false;component.visible=true; break;
    case 'REPLACE_COMPONENT': component.variantId=action.variantId; break;
    case 'SET_POSITION': component.transform.position[{X:0,Y:1,Z:2}[action.axis]]=action.value; break;
    case 'SET_ROTATION': component.transform.rotation[{X:0,Y:1,Z:2}[action.axis]]=action.value; break;
    case 'RESET_COMPONENT': {
      component.dimensionsMm=structuredClone(component.originalDimensionsMm);
      component.transform={position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]};
      component.materialId=undefined;component.color=undefined;component.variantId=undefined;component.visible=true;component.deleted=false;
      break;
    }
  }
  applyDependencyRules(input,next,manifest,action);
  return {ok:true,configuration:next,actions:[action]};
}

export function applyActions(actions:unknown[],manifest:ModelManifest,input:ModelConfiguration,resources:EditorResources={}):ApplyResult{
  let current=cloneConfiguration(input);
  const accepted:EditorAction[]=[];
  for(const rawAction of actions){
    const result=applyAction(rawAction,manifest,current,resources);
    if(!result.ok)return result;
    current=result.configuration;
    accepted.push(...result.actions);
  }
  return {ok:true,configuration:current,actions:accepted};
}
