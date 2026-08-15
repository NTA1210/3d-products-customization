import type {EditorAction} from '@product3d/action-engine';
import type {ModelConfiguration} from '@product3d/model-schema';
import {authFetch} from './supabase-browser';
import {queueExport,waitForJob} from './project-api';

const root=()=>`${(process.env.NEXT_PUBLIC_API_URL??'http://localhost:4000').replace(/\/$/,'')}/api`;
async function request<T>(url:string,init?:RequestInit):Promise<T>{const response=await authFetch(url,init);if(!response.ok)throw new Error(await response.text());return response.json() as Promise<T>;}

export type ValidatedSuggestion={id:string;title:string;reason:string;actions:EditorAction[];valid:boolean;validationErrors:string[]};
export type AiDesignResult={id:string;summary:string;suggestions:ValidatedSuggestion[]};
export type ManufacturingIssue={id:string;ruleId:string;severity:'INFO'|'WARNING'|'ERROR';componentIds:string[];message:string;measuredValue?:number;expectedRange?:{min?:number;max?:number};suggestedActions?:EditorAction[]};

export async function createMultiViewRender(projectId:string,configuration:ModelConfiguration){
  const exported=await queueExport(projectId,configuration);
  await waitForJob(exported.jobId);
  const render=await request<{id:string;jobId:string}>(`${root()}/render-jobs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId,exportJobId:exported.jobId,mode:'MULTI_VIEW',quality:'DRAFT'})});
  await waitForJob(render.jobId);
  return render.id;
}

export async function requestDesignSuggestions(projectId:string,configuration:ModelConfiguration,renderJobId:string,instructions:string){
  return request<AiDesignResult>(`${root()}/projects/${projectId}/ai/design-suggestions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({configurationJson:configuration,renderJobId,instructions})});
}

export async function runManufacturingCheck(projectId:string,configuration:ModelConfiguration){
  return request<{id:string;status:string;issues:ManufacturingIssue[]}>(`${root()}/projects/${projectId}/manufacturability/check`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({configurationJson:configuration})});
}
