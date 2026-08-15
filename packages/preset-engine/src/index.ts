import type {EditorAction} from '@product3d/action-engine';
import {applyActions,type ApplyOptions,type ApplyResult} from '@product3d/editor-core';
import type {ModelConfiguration,ModelManifest} from '@product3d/model-schema';
import {ComponentRole} from '@product3d/model-schema';
import {z} from 'zod';
const TargetSchema=z.object({componentId:z.string().optional(),role:ComponentRole.optional()}).refine(v=>Boolean(v.componentId||v.role),'target requires componentId or role');
export const PresetRuleSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('SET_MATERIAL'),target:TargetSchema,materialId:z.string()}),
 z.object({type:z.literal('SET_COLOR'),target:TargetSchema,color:z.string().regex(/^#[0-9a-fA-F]{6}$/)}),
 z.object({type:z.literal('SET_VISIBILITY'),target:TargetSchema,visible:z.boolean()}),
 z.object({type:z.literal('REPLACE_COMPONENT'),target:TargetSchema,variantId:z.string()}),
 z.object({type:z.literal('SET_DIMENSION'),target:TargetSchema,axis:z.enum(['WIDTH','HEIGHT','DEPTH']),valueMm:z.number().positive()})
]);
export const PresetRuleSetSchema=z.array(PresetRuleSchema).min(1);export type PresetRule=z.infer<typeof PresetRuleSchema>;
function targets(rule:PresetRule,manifest:ModelManifest){return manifest.components.filter(component=>(!rule.target.componentId||component.id===rule.target.componentId)&&(!rule.target.role||component.role===rule.target.role));}
export function compilePresetRules(rules:PresetRule[],manifest:ModelManifest,source:'STYLE'|'PRESET'):EditorAction[]{const actions:EditorAction[]=[];for(const rule of rules){for(const component of targets(rule,manifest)){switch(rule.type){case'SET_MATERIAL':actions.push({type:'SET_MATERIAL',componentId:component.id,materialId:rule.materialId,source});break;case'SET_COLOR':actions.push({type:'SET_COLOR',componentId:component.id,color:rule.color,source});break;case'SET_VISIBILITY':actions.push({type:'SET_VISIBILITY',componentId:component.id,visible:rule.visible,source});break;case'REPLACE_COMPONENT':actions.push({type:'REPLACE_COMPONENT',componentId:component.id,variantId:rule.variantId,source});break;case'SET_DIMENSION':actions.push({type:'SET_DIMENSION',componentId:component.id,axis:rule.axis,valueMm:rule.valueMm,source});break;}}}return actions;}
export function applyPresetRules(rules:PresetRule[],source:'STYLE'|'PRESET',manifest:ModelManifest,configuration:ModelConfiguration,options:ApplyOptions={}):ApplyResult{const parsed=PresetRuleSetSchema.safeParse(rules);if(!parsed.success)return{ok:false,message:parsed.error.message};const actions=compilePresetRules(parsed.data,manifest,source);if(!actions.length)return{ok:false,message:'Preset did not match any components.'};return applyActions(actions,manifest,configuration,options);}
