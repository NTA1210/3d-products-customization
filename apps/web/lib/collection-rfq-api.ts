import type {ModelConfiguration} from '@product3d/model-schema';
import {authFetch} from './supabase-browser';
import {queueExport,saveVersion,waitForJob} from './project-api';
import {runManufacturingCheck} from './ai-manufacturing-api';

const root=()=>`${(process.env.NEXT_PUBLIC_API_URL??'http://localhost:4000').replace(/\/$/,'')}/api`;
async function request<T>(url:string,init?:RequestInit):Promise<T>{const response=await authFetch(url,init);if(!response.ok)throw new Error(await response.text());return response.json() as Promise<T>;}

export type CollectionRecommendation={product:{id:string;name:string;category:string;styleTags:string[];materialTags:string[];colorFamily?:string|null;componentFeatures:string[];thumbnailUrl?:string|null};score:number;breakdown:{style:number;material:number;color:number;other:number};aiExplanation?:string};
export type CollectionResult={weights:{style:number;material:number;color:number;other:number};recommendations:CollectionRecommendation[];ai?:{id:string;summary:string;authoritativeRanking:'DETERMINISTIC'}};
export type Workshop={id:string;name:string;contactJson:Record<string,unknown>;capabilitiesJson:Record<string,unknown>};
export type RfqResult={id:string;status:string;workshop:Workshop;payload:{projectId:string;modelVersionId:string;customerNote:string;dimensions:Record<string,unknown>;components:unknown[];materials:string[];manufacturingIssues:unknown[];previewImages:string[];exportAssetUrl:string}};

type CollectionInput={category:string;colorFamily?:string;styleTags:string[];materialTags:string[];componentFeatures:string[];limit?:number};
function collectionBody(configuration:ModelConfiguration,input:CollectionInput){return JSON.stringify({configurationJson:configuration,...input,limit:input.limit??6});}
export function recommendCollection(projectId:string,configuration:ModelConfiguration,input:CollectionInput){
  return request<CollectionResult>(`${root()}/projects/${projectId}/collection/recommendations`,{method:'POST',headers:{'content-type':'application/json'},body:collectionBody(configuration,input)});
}
export function recommendCollectionWithExplanation(projectId:string,configuration:ModelConfiguration,input:CollectionInput){
  return request<CollectionResult>(`${root()}/projects/${projectId}/collection/recommendations/explain`,{method:'POST',headers:{'content-type':'application/json'},body:collectionBody(configuration,input)});
}

export const listWorkshops=()=>request<Workshop[]>(`${root()}/workshops`);

export async function prepareAndSubmitRfq(projectId:string,configuration:ModelConfiguration,workshopId:string,customerNote:string){
  const version=await saveVersion(projectId,`RFQ ${new Date().toISOString()}`,configuration);
  const [exported,manufacturing]=await Promise.all([queueExport(projectId,configuration),runManufacturingCheck(projectId,configuration)]);
  await waitForJob(exported.jobId);
  return request<RfqResult>(`${root()}/projects/${projectId}/rfq`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({modelVersionId:version.id,workshopId,customerNote,manufacturingCheckId:manufacturing.id,exportJobId:exported.jobId})});
}

export const listRfq=(projectId:string)=>request<RfqResult[]>(`${root()}/projects/${projectId}/rfq`);
