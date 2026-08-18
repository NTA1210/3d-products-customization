import {
  AssetAnalysisSchema,
  ModelConfigurationSchema,
  ModelManifestSchema,
  type AssetAnalysis,
  type ModelConfiguration,
  type ModelManifest,
} from '@product3d/model-schema';
import {authFetch} from './supabase-browser';

const root=()=>`${(process.env.NEXT_PUBLIC_API_URL??'http://localhost:4000').replace(/\/$/,'')}/api`;
async function json<T>(response:Response):Promise<T>{if(!response.ok)throw new Error(await response.text());return response.json() as Promise<T>;}
async function request<T>(input:RequestInfo|URL,init?:RequestInit):Promise<T>{return json<T>(await authFetch(input,init));}

export type ExportFormat='GLB'|'GLTF'|'FBX'|'USDZ'|'OBJ'|'STL';
export type ProjectSummary={id:string;name:string;modelAssetId:string;updatedAt:string;modelAsset:{id:string;name:string;status:string};versions:Array<{id:string;name:string;createdAt:string}>};
export type ProjectVersion={id:string;name:string;configurationJson:unknown;createdAt:string};
export const listProjects=()=>request<ProjectSummary[]>(`${root()}/projects`);
export const createProject=(modelAssetId:string,name:string)=>request<{id:string;name:string}>(`${root()}/projects`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({modelAssetId,name})});
export const saveVersion=(projectId:string,name:string,configuration:ModelConfiguration)=>request<ProjectVersion>(`${root()}/projects/${projectId}/versions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,configurationJson:configuration})});

export async function loadProject(projectId:string,versionId?:string){
  const project=await request<{id:string;name:string;activeVersionId?:string|null;modelAsset:{id:string;name:string};versions:ProjectVersion[]}>(`${root()}/projects/${projectId}`);
  const[manifestRecord,download,analysis]=await Promise.all([
    request<{manifestJson:unknown}|null>(`${root()}/assets/${project.modelAsset.id}/manifest`),
    request<{url:string}>(`${root()}/assets/${project.modelAsset.id}/download?kind=source`),
    request<unknown>(`${root()}/assets/${project.modelAsset.id}/analysis`)
      .then(value=>AssetAnalysisSchema.parse(value) as AssetAnalysis)
      .catch(()=>undefined),
  ]);
  if(!manifestRecord)throw new Error('Project asset has no saved manifest.');
  const version=project.versions.find(item=>item.id===(versionId??project.activeVersionId))??project.versions[0];if(!version)throw new Error('Project has no saved version.');
  return{projectId:project.id,assetId:project.modelAsset.id,assetName:project.modelAsset.name,assetUrl:download.url,analysis,manifest:ModelManifestSchema.parse(manifestRecord.manifestJson) as ModelManifest,configuration:ModelConfigurationSchema.parse(version.configurationJson),versions:project.versions,activeVersionId:version.id};
}

export async function queueExport(projectId:string,configuration:ModelConfiguration,format:ExportFormat='GLB'){
  return request<{jobId:string;format:ExportFormat}>(`${root()}/projects/${projectId}/export`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({configurationJson:configuration,format})});
}
export async function waitForJob(jobId:string){for(let attempt=0;attempt<180;attempt+=1){await new Promise(resolve=>setTimeout(resolve,1000));const job=await request<{status:string;failureReason?:string|null}>(`${root()}/jobs/${jobId}`);if(job.status==='FAILED')throw new Error(job.failureReason||'Background job failed.');if(job.status==='COMPLETED')return job;}throw new Error('Background job timed out.');}
export async function getJobArtifact(jobId:string){return request<{url:string;filename?:string}>(`${root()}/jobs/${jobId}/artifact`);}
export async function exportAndDownload(projectId:string,configuration:ModelConfiguration,format:ExportFormat='GLB'){
  const queued=await queueExport(projectId,configuration,format);await waitForJob(queued.jobId);const artifact=await getJobArtifact(queued.jobId);const anchor=document.createElement('a');anchor.href=artifact.url;anchor.download=artifact.filename??`product.${format.toLowerCase()}`;anchor.click();
}
