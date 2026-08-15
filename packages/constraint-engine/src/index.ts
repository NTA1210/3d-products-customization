import type { ModelManifest,ModelConfiguration } from '@product3d/model-schema';
import type { EditorAction } from '@product3d/action-engine';

export type ValidationResult={ok:true}|{ok:false;code:string;message:string};

export function validateAction(action:EditorAction,manifest:ModelManifest,config:ModelConfiguration):ValidationResult{
  if(!config.placement.locked)return {ok:false,code:'PLACEMENT_NOT_LOCKED',message:'Lock placement before customization.'};
  const component=manifest.components.find(item=>item.id===action.componentId);
  if(!component)return {ok:false,code:'COMPONENT_NOT_FOUND',message:'Component does not exist in the active manifest.'};
  if(!component.editable)return {ok:false,code:'COMPONENT_NOT_EDITABLE',message:'Selected component is not editable.'};

  if(action.type==='SET_DIMENSION'){
    if(!['AXIS_SCALE','UNIFORM_SCALE','PARAMETRIC'].includes(component.scalingMode)){
      return {ok:false,code:'SCALING_MODE_REJECTED',message:`${component.scalingMode} does not support direct dimension editing.`};
    }
    const key=action.axis.toLowerCase() as 'width'|'height'|'depth';
    const mappedAxis=manifest.axisMapping[key];
    if(!component.editableAxes[mappedAxis])return {ok:false,code:'AXIS_NOT_EDITABLE',message:`${action.axis} editing is not enabled for this component.`};
    const range=component.constraints[key];
    if(range?.min!==undefined&&action.valueMm<range.min)return {ok:false,code:'BELOW_MIN',message:`Minimum supported ${key} is ${range.min} mm.`};
    if(range?.max!==undefined&&action.valueMm>range.max)return {ok:false,code:'ABOVE_MAX',message:`Maximum supported ${key} is ${range.max} mm.`};
  }
  return {ok:true};
}

export const toMm=(value:number,unit:'mm'|'cm'|'inch')=>unit==='mm'?value:unit==='cm'?value*10:value*25.4;
export const fromMm=(valueMm:number,unit:'mm'|'cm'|'inch')=>unit==='mm'?valueMm:unit==='cm'?valueMm/10:valueMm/25.4;
