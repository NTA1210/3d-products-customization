import type {EditorAction} from '@product3d/action-engine';
import type {ModelConfiguration} from '@product3d/model-schema';
import {authFetch} from './supabase-browser';
import {getJobArtifact,queueExport,waitForJob} from './project-api';

const root=()=>`${(process.env.NEXT_PUBLIC_API_URL??'http://localhost:4000').replace(/\/$/,'')}/api`;
async function request<T>(url:string,init?:RequestInit):Promise<T>{const response=await authFetch(url,init);if(!response.ok)throw new Error(await response.text());return response.json() as Promise<T>;}

export type ValidatedSuggestion={id:string;title:string;reason:string;actions:EditorAction[];valid:boolean;validationErrors:string[];requestedStyleIds?:string[]};
export type AiDesignResult={id:string;summary:string;suggestions:ValidatedSuggestion[]};
export type ManufacturingIssue={id:string;ruleId:string;severity:'INFO'|'WARNING'|'ERROR';componentIds:string[];message:string;measuredValue?:number;expectedRange?:{min?:number;max?:number};suggestedActions?:EditorAction[]};
export type ManufacturingCheckResult={id:string;status:string;issues:ManufacturingIssue[];geometryJson?:Record<string,unknown>|null};
export type ManufacturingVisionExplanation={issueId:string;explanation:string;impact:string;suggestedNextStep:string};
export type ManufacturingVisionResult={id:string;manufacturingCheckId:string;renderJobId:string;summary:string;visualObservations:string[];explanations:ManufacturingVisionExplanation[];authoritativeSource:'RULE_AND_GEOMETRY'};
export type VisualizationConsistencyObservation={category:'SHAPE'|'COMPONENT_STRUCTURE'|'MATERIAL_COLOR'|'OCCLUSION';severity:'INFO'|'WARNING';message:string};
export type VisualizationConsistencyResult={id:string;summary:string;shapeScore:number;componentScore:number;materialColorScore:number;overallScore:number;status:'PASS'|'REVIEW';observations:VisualizationConsistencyObservation[];thresholds:{shape:number;component:number;materialColor:number;overall:number};authority:'SOURCE_RENDER'};

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
  return request<ManufacturingCheckResult>(`${root()}/projects/${projectId}/manufacturability/check`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({configurationJson:configuration})});
}

export async function runVisionManufacturingReview(projectId:string,configuration:ModelConfiguration){
  const deterministic=await runManufacturingCheck(projectId,configuration);
  const renderJobId=await createMultiViewRender(projectId,configuration);
  const vision=await request<ManufacturingVisionResult>(`${root()}/projects/${projectId}/manufacturability/vision-review`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({manufacturingCheckId:deterministic.id,renderJobId})});
  return{check:deterministic,vision};
}

export async function runGeometryManufacturingCheck(projectId:string,configuration:ModelConfiguration){
  const deterministic=await runManufacturingCheck(projectId,configuration);
  const exported=await queueExport(projectId,configuration);
  await waitForJob(exported.jobId);
  const queued=await request<{jobId:string;checkId:string}>(`${root()}/projects/${projectId}/manufacturability/geometry`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({manufacturingCheckId:deterministic.id,exportJobId:exported.jobId})});
  await waitForJob(queued.jobId);
  return request<ManufacturingCheckResult>(`${root()}/projects/${projectId}/manufacturability/checks/${queued.checkId}`);
}

export async function createLifestyleVisualization(projectId:string,configuration:ModelConfiguration,prompt:string){
  const renderJobId=await createMultiViewRender(projectId,configuration);
  const queued=await request<{id:string;jobId:string;status:string}>(`${root()}/projects/${projectId}/ai/visualizations`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({renderJobId,prompt})});
  await waitForJob(queued.jobId);
  const artifact=await getJobArtifact(queued.jobId);
  try{
    const review=await request<VisualizationConsistencyResult>(`${root()}/projects/${projectId}/ai/visualization-consistency`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({renderJobId,generatedJobId:queued.jobId})});
    return{id:queued.id,url:artifact.url,filename:artifact.filename,review};
  }catch(error){
    return{id:queued.id,url:artifact.url,filename:artifact.filename,reviewError:error instanceof Error?error.message:'Consistency review unavailable.'};
  }
}
