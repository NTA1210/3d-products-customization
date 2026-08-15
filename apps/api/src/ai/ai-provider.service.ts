import {BadGatewayException,Injectable,ServiceUnavailableException} from '@nestjs/common';
import {AI_DESIGN_JSON_SCHEMA,AiDesignResponseSchema} from '@product3d/ai-engine';

type DesignProviderInput={prompt:string;imageUrls:string[]};
export type AiProviderResult={provider:string;model:string;response:unknown};
function extractOutputText(payload:any):string|undefined{if(typeof payload?.output_text==='string')return payload.output_text;for(const item of payload?.output??[])for(const content of item?.content??[])if(content?.type==='output_text'&&typeof content.text==='string')return content.text;return undefined;}

@Injectable()
export class AiProviderService{
  async designSuggestions(input:DesignProviderInput):Promise<AiProviderResult>{
    const startedAt=Date.now(),provider=(process.env.AI_PROVIDER??'disabled').toLowerCase();
    if(provider==='disabled')throw new ServiceUnavailableException('AI provider is disabled. Set AI_PROVIDER=openai on the server.');
    if(provider!=='openai')throw new ServiceUnavailableException(`Unsupported AI provider: ${provider}`);
    const apiKey=process.env.OPENAI_API_KEY;if(!apiKey)throw new ServiceUnavailableException('OPENAI_API_KEY is not configured.');
    const model=process.env.OPENAI_DESIGN_MODEL??'gpt-5-mini';
    console.info(JSON.stringify({event:'ai_request_started',provider:'openai',model,imageCount:input.imageUrls.length}));
    try{
      const content:any[]=[{type:'input_text',text:input.prompt},...input.imageUrls.map(image_url=>({type:'input_image',image_url,detail:'high'}))];
      const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model,input:[{role:'user',content}],text:{format:{type:'json_schema',name:'product_design_suggestions',strict:true,schema:AI_DESIGN_JSON_SCHEMA}}})});
      if(!response.ok)throw new BadGatewayException(`AI provider request failed (${response.status}): ${(await response.text()).slice(0,1200)}`);
      const payload=await response.json(),text=extractOutputText(payload);if(!text)throw new BadGatewayException('AI provider returned no structured text output.');
      let parsed:unknown;try{parsed=JSON.parse(text);}catch{throw new BadGatewayException('AI provider returned invalid JSON.');}
      const validated=AiDesignResponseSchema.parse(parsed);
      console.info(JSON.stringify({event:'ai_request_completed',provider:'openai',model,imageCount:input.imageUrls.length,durationMs:Date.now()-startedAt}));
      return{provider:'openai',model,response:validated};
    }catch(error){console.error(JSON.stringify({event:'ai_request_failed',provider:'openai',model,imageCount:input.imageUrls.length,durationMs:Date.now()-startedAt,error:error instanceof Error?error.message:String(error)}));throw error;}
  }
}
