import {z} from 'zod';
import type {EditorAction} from '@product3d/action-engine';
import type {ModelConfiguration,ModelManifest} from '@product3d/model-schema';

export const ManufacturingSeveritySchema=z.enum(['INFO','WARNING','ERROR']);
export type ManufacturingSeverity=z.infer<typeof ManufacturingSeveritySchema>;

const SelectorSchema=z.object({componentId:z.string().min(1).optional(),role:z.string().min(1).optional()}).refine(v=>Boolean(v.componentId||v.role),'selector requires componentId or role');
export const ManufacturingRuleDefinitionSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('DIMENSION_RANGE'),selector:SelectorSchema,dimension:z.enum(['width','height','depth']),min:z.number().nonnegative().optional(),max:z.number().positive().optional(),message:z.string().min(1).optional()}),
  z.object({type:z.literal('MATERIAL_CATEGORY'),selector:SelectorSchema,allowedCategories:z.array(z.string().min(1)).min(1),message:z.string().min(1).optional()}),
  z.object({type:z.literal('REQUIRED_ROLE'),role:z.string().min(1),minCount:z.number().int().positive().default(1),message:z.string().min(1).optional()}),
]);
export type ManufacturingRuleDefinition=z.infer<typeof ManufacturingRuleDefinitionSchema>;

export const ManufacturingRuleSchema=z.object({id:z.string().min(1),name:z.string().min(1),severity:ManufacturingSeveritySchema,definition:ManufacturingRuleDefinitionSchema});
export type ManufacturingRule=z.infer<typeof ManufacturingRuleSchema>;

export const ManufacturingIssueSchema=z.object({
  id:z.string().min(1),ruleId:z.string().min(1),severity:ManufacturingSeveritySchema,componentIds:z.array(z.string()),message:z.string().min(1),measuredValue:z.number().optional(),expectedRange:z.object({min:z.number().optional(),max:z.number().optional()}).optional(),suggestedActions:z.array(z.any()).optional(),
});
export type ManufacturingIssue=z.infer<typeof ManufacturingIssueSchema> & {suggestedActions?:EditorAction[]};
export type MaterialCatalogEntry={id:string;category:string};

function matchingComponents(manifest:ModelManifest,selector:{componentId?:string;role?:string}){return manifest.components.filter(component=>(!selector.componentId||component.id===selector.componentId)&&(!selector.role||component.role===selector.role));}
function dimensionAxis(dimension:'width'|'height'|'depth'){return dimension.toUpperCase() as 'WIDTH'|'HEIGHT'|'DEPTH';}

export function rulesFromManifest(manifest:ModelManifest):ManufacturingRule[]{
  const rules:ManufacturingRule[]=[];
  for(const component of manifest.components){
    for(const dimension of ['width','height','depth'] as const){
      const range=component.constraints[dimension];
      if(range&&(range.min!==undefined||range.max!==undefined))rules.push({id:`manifest:${component.id}:${dimension}`,name:`${component.name} ${dimension} constraint`,severity:'ERROR',definition:{type:'DIMENSION_RANGE',selector:{componentId:component.id},dimension,min:range.min,max:range.max,message:`${component.name} ${dimension} violates the approved manifest constraint.`}});
    }
    if(component.allowedMaterialCategories?.length)rules.push({id:`manifest:${component.id}:material`,name:`${component.name} material compatibility`,severity:'ERROR',definition:{type:'MATERIAL_CATEGORY',selector:{componentId:component.id},allowedCategories:component.allowedMaterialCategories,message:`${component.name} material is outside the approved categories in the manifest.`}});
  }
  return rules;
}

export function runManufacturingRules(input:{manifest:ModelManifest;configuration:ModelConfiguration;rules:ManufacturingRule[];materials?:MaterialCatalogEntry[]}):ManufacturingIssue[]{
  const materials=new Map((input.materials??[]).map(material=>[material.id,material]));
  const issues:ManufacturingIssue[]=[];
  const rules=[...rulesFromManifest(input.manifest),...input.rules];
  for(const rule of rules){
    const definition=rule.definition;
    if(definition.type==='REQUIRED_ROLE'){
      const matches=input.manifest.components.filter(component=>component.role===definition.role&&input.configuration.components[component.id]&&!input.configuration.components[component.id].deleted&&input.configuration.components[component.id].visible);
      if(matches.length<definition.minCount)issues.push({id:`${rule.id}:required-role`,ruleId:rule.id,severity:rule.severity,componentIds:matches.map(c=>c.id),message:definition.message??`At least ${definition.minCount} visible ${definition.role} component(s) are required.`,measuredValue:matches.length,expectedRange:{min:definition.minCount}});
      continue;
    }
    for(const component of matchingComponents(input.manifest,definition.selector)){
      const state=input.configuration.components[component.id];
      if(!state||state.deleted||!state.visible)continue;
      if(definition.type==='DIMENSION_RANGE'){
        const value=state.dimensionsMm[definition.dimension],below=definition.min!==undefined&&value<definition.min,above=definition.max!==undefined&&value>definition.max;
        if(!below&&!above)continue;
        const target=below?definition.min:definition.max,suggestedActions:EditorAction[]=[];
        const mappedAxis=input.manifest.axisMapping[definition.dimension];
        if(target!==undefined&&component.editable&&component.editableAxes[mappedAxis]&&component.scalingMode==='AXIS_SCALE')suggestedActions.push({type:'SET_DIMENSION',componentId:component.id,axis:dimensionAxis(definition.dimension),valueMm:target,source:'MANUAL'});
        issues.push({id:`${rule.id}:${component.id}:${definition.dimension}`,ruleId:rule.id,severity:rule.severity,componentIds:[component.id],message:definition.message??`${component.name} ${definition.dimension} is outside the manufacturing range.`,measuredValue:value,expectedRange:{min:definition.min,max:definition.max},suggestedActions});
        continue;
      }
      if(definition.type==='MATERIAL_CATEGORY'&&state.materialId){
        const material=materials.get(state.materialId);
        if(material&&!definition.allowedCategories.includes(material.category))issues.push({id:`${rule.id}:${component.id}:material`,ruleId:rule.id,severity:rule.severity,componentIds:[component.id],message:definition.message??`${component.name} uses a material category that is not allowed for manufacturing.`});
      }
    }
  }
  const unique=new Map(issues.map(issue=>[issue.id,issue]));
  return [...unique.values()];
}
