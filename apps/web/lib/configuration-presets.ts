import type {ModelConfiguration,ModelManifest} from '@product3d/model-schema';
import type {PresetRule} from '@product3d/preset-engine';

function freshTransform(){return{position:[0,0,0] as [number,number,number],rotation:[0,0,0] as [number,number,number],scale:[1,1,1] as [number,number,number]};}

/**
 * Reset product customization while preserving the already-approved scene placement.
 * Placement is intentionally not unlocked: Reset Product means reset the product design,
 * not force the user back into the placement step.
 */
export function resetProductConfiguration(input:ModelConfiguration):ModelConfiguration{
  const next=structuredClone(input);
  next.components=Object.fromEntries(Object.entries(next.components).map(([id,state])=>[id,{
    ...state,
    dimensionsMm:structuredClone(state.originalDimensionsMm),
    transform:freshTransform(),
    materialId:undefined,
    color:undefined,
    variantId:undefined,
    visible:true,
    deleted:false,
  }]));
  next.attachments=[];
  next.appliedStyleId=undefined;
  next.appliedPresetId=undefined;
  return next;
}

/** Build a user preset from the meaningful current customization state. */
export function presetRulesFromConfiguration(manifest:ModelManifest,configuration:ModelConfiguration):PresetRule[]{
  const rules:PresetRule[]=[];
  for(const component of manifest.components){
    if(!component.editable)continue;
    const state=configuration.components[component.id];
    if(!state||state.deleted)continue;
    const target={componentId:component.id};
    if(state.variantId)rules.push({type:'REPLACE_COMPONENT',target,variantId:state.variantId});
    if(state.materialId)rules.push({type:'SET_MATERIAL',target,materialId:state.materialId});
    if(state.color)rules.push({type:'SET_COLOR',target,color:state.color});
    if(!state.visible)rules.push({type:'SET_VISIBILITY',target,visible:false});
    if(['AXIS_SCALE','UNIFORM_SCALE','PARAMETRIC'].includes(component.scalingMode)){
      for(const [key,axis] of [['width','WIDTH'],['height','HEIGHT'],['depth','DEPTH']] as const){
        const mapped=manifest.axisMapping[key];
        if(!component.editableAxes[mapped])continue;
        const value=state.dimensionsMm[key];
        if(Math.abs(value-state.originalDimensionsMm[key])>1e-6)rules.push({type:'SET_DIMENSION',target,axis,valueMm:value});
      }
    }
  }
  return rules;
}
