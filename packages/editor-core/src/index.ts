import type {
  AnchorDefinition,
  ComponentVariant,
  MaterialPreset,
  ModelConfiguration,
  ModelManifest,
  TransformState,
} from '@product3d/model-schema';
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

function cloneConfiguration(input:ModelConfiguration):ModelConfiguration{
  const next=structuredClone(input);
  next.placement.transform=cloneTransform(next.placement.transform);
  for(const component of Object.values(next.components))component.transform=cloneTransform(component.transform);
  next.attachments=[...(next.attachments??[])];
  return next;
}

function anchorCompatible(source:AnchorDefinition,target:AnchorDefinition){
  if(!source.snapEnabled||!target.snapEnabled)return false;
  const sourceTypes=source.compatibleTypes?.length?source.compatibleTypes:['GENERIC'];
  const targetTypes=target.compatibleTypes?.length?target.compatibleTypes:['GENERIC'];
  const sourceType=source.connectionType||'GENERIC';
  const targetType=target.connectionType||'GENERIC';
  return sourceTypes.includes(targetType)&&targetTypes.includes(sourceType);
}

function validateAttachment(manifest:ModelManifest,action:Extract<EditorAction,{type:'ATTACH_COMPONENT'}>):ApplyFailure|undefined{
  if(action.componentId===action.targetComponentId){
    return {ok:false,code:'ATTACH_SELF',message:'A component cannot attach to itself.',action};
  }
  const anchors=manifest.anchors??[];
  const sourceAnchor=anchors.find(item=>item.id===action.sourceAnchorId&&item.componentId===action.componentId);
  const targetAnchor=anchors.find(item=>item.id===action.targetAnchorId&&item.componentId===action.targetComponentId);
  if(!sourceAnchor||!targetAnchor){
    return {ok:false,code:'ANCHOR_NOT_FOUND',message:'One or both attachment anchors do not exist in the active manifest.',action};
  }
  if(!anchorCompatible(sourceAnchor,targetAnchor)){
    return {ok:false,code:'ANCHOR_INCOMPATIBLE',message:`${sourceAnchor.connectionType} is not compatible with ${targetAnchor.connectionType}.`,action};
  }
  return undefined;
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

function translateAttachedChildren(config:ModelConfiguration,targetComponentId:string,index:number,delta:number,visited=new Set<string>()){
  if(Math.abs(delta)<1e-9||visited.has(targetComponentId))return;
  visited.add(targetComponentId);
  for(const attachment of (config.attachments??[]).filter(item=>item.targetComponentId===targetComponentId)){
    const source=config.components[attachment.sourceComponentId];
    if(!source)continue;
    source.transform.position[index]+=delta;
    translateAttachedChildren(config,attachment.sourceComponentId,index,delta,visited);
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
    if(!canApplyVariant(definition,variant,manifest.modelTags??[],manifest.anchors??[]))return {ok:false,code:'VARIANT_INCOMPATIBLE',message:'This variant is not compatible with the selected component, model tags, or required semantic anchor.',action};
  }
  if(action.type==='ATTACH_COMPONENT'){
    const targetDefinition=manifest.components.find(item=>item.id===action.targetComponentId);
    const targetState=input.components[action.targetComponentId];
    if(!targetDefinition||!targetState||targetState.deleted||!targetState.visible){
      return {ok:false,code:'ATTACH_TARGET_UNAVAILABLE',message:'Attachment target is not available.',action};
    }
    const failure=validateAttachment(manifest,action);
    if(failure)return failure;
  }

  const next=cloneConfiguration(input);
  const component=next.components[action.componentId];
  const positionBefore=[...component.transform.position] as [number,number,number];

  if(['SET_POSITION','SET_ROTATION','SET_DIMENSION','REPLACE_COMPONENT'].includes(action.type)){
    next.attachments=(next.attachments??[]).filter(item=>item.sourceComponentId!==action.componentId);
  }

  switch(action.type){
    case 'SET_DIMENSION': component.dimensionsMm[componentAxis(action.axis)]=action.valueMm; break;
    case 'SET_MATERIAL': component.materialId=action.materialId; break;
    case 'SET_COLOR': component.color=action.color; break;
    case 'SET_VISIBILITY': component.visible=action.visible; break;
    case 'DELETE_COMPONENT':
      component.deleted=true;component.visible=false;
      next.attachments=(next.attachments??[]).filter(item=>item.sourceComponentId!==action.componentId&&item.targetComponentId!==action.componentId);
      break;
    case 'RESTORE_COMPONENT': component.deleted=false;component.visible=true; break;
    case 'REPLACE_COMPONENT': component.variantId=action.variantId; break;
    case 'SET_POSITION': component.transform.position[{X:0,Y:1,Z:2}[action.axis]]=action.value; break;
    case 'SET_ROTATION': component.transform.rotation[{X:0,Y:1,Z:2}[action.axis]]=action.value; break;
    case 'ATTACH_COMPONENT': {
      next.attachments=(next.attachments??[]).filter(item=>item.sourceComponentId!==action.componentId);
      next.attachments.push({
        id:`att_${action.componentId}_${action.sourceAnchorId}_${action.targetComponentId}_${action.targetAnchorId}`,
        sourceComponentId:action.componentId,
        sourceAnchorId:action.sourceAnchorId,
        targetComponentId:action.targetComponentId,
        targetAnchorId:action.targetAnchorId,
        createdBy:action.createdBy,
      });
      break;
    }
    case 'DETACH_COMPONENT':
      next.attachments=(next.attachments??[]).filter(item=>item.sourceComponentId!==action.componentId);
      break;
    case 'RESET_COMPONENT': {
      component.dimensionsMm=structuredClone(component.originalDimensionsMm);
      component.transform={position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]};
      component.materialId=undefined;component.color=undefined;component.variantId=undefined;component.visible=true;component.deleted=false;
      next.attachments=(next.attachments??[]).filter(item=>item.sourceComponentId!==action.componentId&&item.targetComponentId!==action.componentId);
      break;
    }
  }

  applyDependencyRules(input,next,manifest,action);

  if(action.type==='SET_POSITION'){
    const index={X:0,Y:1,Z:2}[action.axis];
    const delta=component.transform.position[index]-positionBefore[index];
    translateAttachedChildren(next,action.componentId,index,delta);
  }

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
