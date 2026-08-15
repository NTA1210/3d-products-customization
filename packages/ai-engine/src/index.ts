import {z} from 'zod';
import {EditorActionSchema,type EditorAction} from '@product3d/action-engine';
import {applyActions} from '@product3d/editor-core';
import type {ComponentVariant,MaterialPreset,ModelConfiguration,ModelManifest} from '@product3d/model-schema';

const AiActionSchema=EditorActionSchema.refine(action=>action.source==='AI',{message:'AI suggestions must use source=AI'});
export const AiSuggestionSchema=z.object({id:z.string().min(1),title:z.string().min(1),reason:z.string().min(1),actions:z.array(AiActionSchema).min(1).max(20)});
export const AiDesignResponseSchema=z.object({summary:z.string().min(1),suggestions:z.array(AiSuggestionSchema).max(12)});
export type AiDesignResponse=z.infer<typeof AiDesignResponseSchema>;

export type AiCatalog={materialIds:Set<string>;variantIds:Set<string>;styleIds:Set<string>;componentIds:Set<string>};

export function validateAiDesignResponse(input:{response:unknown;manifest:ModelManifest;configuration:ModelConfiguration;catalog:AiCatalog;materials?:MaterialPreset[];variants?:ComponentVariant[]}){
  const parsed=AiDesignResponseSchema.parse(input.response);
  const suggestions=parsed.suggestions.map(suggestion=>{
    const errors:string[]=[];
    for(const action of suggestion.actions as EditorAction[]){
      if(!input.catalog.componentIds.has(action.componentId))errors.push(`Unknown componentId: ${action.componentId}`);
      if(action.type==='SET_MATERIAL'&&!input.catalog.materialIds.has(action.materialId))errors.push(`Unknown materialId: ${action.materialId}`);
      if(action.type==='REPLACE_COMPONENT'&&!input.catalog.variantIds.has(action.variantId))errors.push(`Unknown variantId: ${action.variantId}`);
    }
    if(!errors.length){
      const applied=applyActions(suggestion.actions as EditorAction[],input.manifest,input.configuration,{materials:input.materials??[],variants:input.variants??[]});
      if(!applied.ok)errors.push(applied.message);
    }
    return {...suggestion,valid:errors.length===0,validationErrors:errors};
  });
  return {summary:parsed.summary,suggestions};
}

export const AI_DESIGN_JSON_SCHEMA={
  type:'object',additionalProperties:false,required:['summary','suggestions'],properties:{
    summary:{type:'string'},
    suggestions:{type:'array',maxItems:12,items:{type:'object',additionalProperties:false,required:['id','title','reason','actions'],properties:{
      id:{type:'string'},title:{type:'string'},reason:{type:'string'},
      actions:{type:'array',minItems:1,maxItems:20,items:{
        anyOf:[
          {type:'object',additionalProperties:false,required:['type','componentId','axis','valueMm','source'],properties:{type:{const:'SET_DIMENSION'},componentId:{type:'string'},axis:{enum:['WIDTH','HEIGHT','DEPTH']},valueMm:{type:'number',exclusiveMinimum:0},source:{const:'AI'}}},
          {type:'object',additionalProperties:false,required:['type','componentId','materialId','source'],properties:{type:{const:'SET_MATERIAL'},componentId:{type:'string'},materialId:{type:'string'},source:{const:'AI'}}},
          {type:'object',additionalProperties:false,required:['type','componentId','color','source'],properties:{type:{const:'SET_COLOR'},componentId:{type:'string'},color:{type:'string',pattern:'^#[0-9A-Fa-f]{6}$'},source:{const:'AI'}}},
          {type:'object',additionalProperties:false,required:['type','componentId','variantId','source'],properties:{type:{const:'REPLACE_COMPONENT'},componentId:{type:'string'},variantId:{type:'string'},source:{const:'AI'}}}
        ]
      }}
    }}}
  }
} as const;
