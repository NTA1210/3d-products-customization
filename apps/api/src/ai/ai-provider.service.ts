import {BadGatewayException,Injectable,ServiceUnavailableException} from '@nestjs/common';
import {AI_DESIGN_JSON_SCHEMA,AiDesignResponseSchema} from '@product3d/ai-engine';
import {z} from 'zod';

type VisionProviderInput={prompt:string;imageUrls:string[]};
export type AiProviderResult={provider:string;model:string;response:unknown};
function extractOutputText(payload:any):string|undefined{if(typeof payload?.output_text==='string')return payload.output_text;for(const item of payload?.output??[])for(const content of item?.content??[])if(content?.type==='output_text'&&typeof content.text==='string')return content.text;return undefined;}

export const ManufacturingVisionResponseSchema=z.object({
  summary:z.string().min(1),
  visualObservations:z.array(z.string().min(1)).max(12),
  explanations:z.array(z.object({issueId:z.string().min(1),explanation:z.string().min(1),impact:z.string().min(1),suggestedNextStep:z.string().min(1)})).max(50),
});
export type ManufacturingVisionResponse=z.infer<typeof ManufacturingVisionResponseSchema>;

export const CollectionExplanationResponseSchema=z.object({
  summary:z.string().min(1),
  explanations:z.array(z.object({productId:z.string().min(1),explanation:z.string().min(1)})).max(20),
});
export type CollectionExplanationResponse=z.infer<typeof CollectionExplanationResponseSchema>;

export const VisualizationConsistencyResponseSchema=z.object({
  summary:z.string().min(1),
  shapeScore:z.number().min(0).max(1),
  componentScore:z.number().min(0).max(1),
  materialColorScore:z.number().min(0).max(1),
  observations:z.array(z.object({
    category:z.enum(['SHAPE','COMPONENT_STRUCTURE','MATERIAL_COLOR','OCCLUSION']),
    severity:z.enum(['INFO','WARNING']),
    message:z.string().min(1),
  })).max(12),
});
export type VisualizationConsistencyResponse=z.infer<typeof VisualizationConsistencyResponseSchema>;

const MANUFACTURING_VISION_JSON_SCHEMA={
  type:'object',additionalProperties:false,required:['summary','visualObservations','explanations'],properties:{
    summary:{type:'string'},
    visualObservations:{type:'array',maxItems:12,items:{type:'string'}},
    explanations:{type:'array',maxItems:50,items:{type:'object',additionalProperties:false,required:['issueId','explanation','impact','suggestedNextStep'],properties:{issueId:{type:'string'},explanation:{type:'string'},impact:{type:'string'},suggestedNextStep:{type:'string'}}}},
  },
} as const;

const COLLECTION_EXPLANATION_JSON_SCHEMA={
  type:'object',additionalProperties:false,required:['summary','explanations'],properties:{
    summary:{type:'string'},
    explanations:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,required:['productId','explanation'],properties:{productId:{type:'string'},explanation:{type:'string'}}}},
  },
} as const;

const VISUALIZATION_CONSISTENCY_JSON_SCHEMA={
  type:'object',additionalProperties:false,required:['summary','shapeScore','componentScore','materialColorScore','observations'],properties:{
    summary:{type:'string'},
    shapeScore:{type:'number',minimum:0,maximum:1},
    componentScore:{type:'number',minimum:0,maximum:1},
    materialColorScore:{type:'number',minimum:0,maximum:1},
    observations:{type:'array',maxItems:12,items:{type:'object',additionalProperties:false,required:['category','severity','message'],properties:{category:{type:'string',enum:['SHAPE','COMPONENT_STRUCTURE','MATERIAL_COLOR','OCCLUSION']},severity:{type:'string',enum:['INFO','WARNING']},message:{type:'string'}}}},
  },
} as const;

@Injectable()
export class AiProviderService{
  private settings(){
    const provider=(process.env.AI_PROVIDER??'disabled').toLowerCase();
    if(provider==='disabled')throw new ServiceUnavailableException('AI provider is disabled. Set AI_PROVIDER=openai on the server.');
    if(provider!=='openai')throw new ServiceUnavailableException(`Unsupported AI provider: ${provider}`);
    const apiKey=process.env.OPENAI_API_KEY;if(!apiKey)throw new ServiceUnavailableException('OPENAI_API_KEY is not configured.');
    return{provider,apiKey};
  }

  private async structured(input:VisionProviderInput,options:{model:string;schema:object;schemaName:string;event:string;parse:(value:unknown)=>unknown}):Promise<AiProviderResult>{
    const startedAt=Date.now(),{apiKey}=this.settings(),model=options.model;
    console.info(JSON.stringify({event:`${options.event}_started`,provider:'openai',model,imageCount:input.imageUrls.length}));
    try{
      const content:any[]=[{type:'input_text',text:input.prompt},...input.imageUrls.map(image_url=>({type:'input_image',image_url,detail:'high'}))];
      const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model,input:[{role:'user',content}],text:{format:{type:'json_schema',name:options.schemaName,strict:true,schema:options.schema}}})});
      if(!response.ok)throw new BadGatewayException(`AI provider request failed (${response.status}): ${(await response.text()).slice(0,1200)}`);
      const payload=await response.json(),text=extractOutputText(payload);if(!text)throw new BadGatewayException('AI provider returned no structured text output.');
      let parsed:unknown;try{parsed=JSON.parse(text);}catch{throw new BadGatewayException('AI provider returned invalid JSON.');}
      const validated=options.parse(parsed);
      console.info(JSON.stringify({event:`${options.event}_completed`,provider:'openai',model,imageCount:input.imageUrls.length,durationMs:Date.now()-startedAt}));
      return{provider:'openai',model,response:validated};
    }catch(error){console.error(JSON.stringify({event:`${options.event}_failed`,provider:'openai',model,imageCount:input.imageUrls.length,durationMs:Date.now()-startedAt,error:error instanceof Error?error.message:String(error)}));throw error;}
  }

  async designSuggestions(input:VisionProviderInput):Promise<AiProviderResult>{
    return this.structured(input,{model:process.env.OPENAI_DESIGN_MODEL??'gpt-5-mini',schema:AI_DESIGN_JSON_SCHEMA,schemaName:'product_design_suggestions',event:'ai_design_request',parse:value=>AiDesignResponseSchema.parse(value)});
  }

  async manufacturingVision(input:VisionProviderInput):Promise<AiProviderResult>{
    return this.structured(input,{model:process.env.OPENAI_MANUFACTURING_MODEL??process.env.OPENAI_DESIGN_MODEL??'gpt-5-mini',schema:MANUFACTURING_VISION_JSON_SCHEMA,schemaName:'manufacturing_vision_review',event:'manufacturing_vision_request',parse:value=>ManufacturingVisionResponseSchema.parse(value)});
  }

  async collectionExplanation(input:VisionProviderInput):Promise<AiProviderResult>{
    return this.structured(input,{model:process.env.OPENAI_COLLECTION_MODEL??process.env.OPENAI_DESIGN_MODEL??'gpt-5-mini',schema:COLLECTION_EXPLANATION_JSON_SCHEMA,schemaName:'collection_recommendation_explanation',event:'collection_explanation_request',parse:value=>CollectionExplanationResponseSchema.parse(value)});
  }

  async visualizationConsistency(input:VisionProviderInput):Promise<AiProviderResult>{
    return this.structured(input,{model:process.env.OPENAI_VISUALIZATION_REVIEW_MODEL??process.env.OPENAI_DESIGN_MODEL??'gpt-5-mini',schema:VISUALIZATION_CONSISTENCY_JSON_SCHEMA,schemaName:'visualization_consistency_review',event:'visualization_consistency_request',parse:value=>VisualizationConsistencyResponseSchema.parse(value)});
  }
}
