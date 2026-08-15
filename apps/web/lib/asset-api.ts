export type AssetPipelineStatus = 'idle'|'requesting-upload'|'uploading'|'queued'|'processing'|'retrying'|'ready'|'failed';

type ImportResponse={asset:{id:string};upload:{url:string;headers:Record<string,string>}};
type JobResponse={id:string;status:string;failureReason?:string|null};

const apiRoot=()=>`${(process.env.NEXT_PUBLIC_API_URL??'http://localhost:4000').replace(/\/$/,'')}/api`;

async function expectJson<T>(response:Response):Promise<T>{
  if(!response.ok){const text=await response.text();throw new Error(text||`Request failed (${response.status})`);}
  return response.json() as Promise<T>;
}

const sleep=(ms:number,signal?:AbortSignal)=>new Promise<void>((resolve,reject)=>{
  const timer=setTimeout(resolve,ms);
  signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});
});

export async function startAssetPipeline(file:File,onStatus:(status:AssetPipelineStatus)=>void,signal?:AbortSignal){
  onStatus('requesting-upload');
  const contentType=file.type||'model/gltf-binary';
  const imported=await expectJson<ImportResponse>(await fetch(`${apiRoot()}/assets/import`,{
    method:'POST',headers:{'content-type':'application/json'},signal,
    body:JSON.stringify({name:file.name.replace(/\.glb$/i,''),originalFilename:file.name,contentType,sizeBytes:file.size})
  }));

  onStatus('uploading');
  const uploadResponse=await fetch(imported.upload.url,{method:'PUT',headers:imported.upload.headers,body:file,signal});
  if(!uploadResponse.ok)throw new Error(`Object-storage upload failed (${uploadResponse.status}).`);

  onStatus('queued');
  const queued=await expectJson<{jobId:string;status:string}>(await fetch(`${apiRoot()}/assets/${imported.asset.id}/analyze`,{method:'POST',signal}));

  for(let attempt=0;attempt<180;attempt+=1){
    await sleep(1000,signal);
    const job=await expectJson<JobResponse>(await fetch(`${apiRoot()}/jobs/${queued.jobId}`,{signal}));
    const normalized=job.status.toLowerCase();
    if(normalized==='completed'){onStatus('ready');return{assetId:imported.asset.id,jobId:queued.jobId};}
    if(normalized==='failed'){onStatus('failed');throw new Error(job.failureReason||'Asset processing failed.');}
    if(normalized==='retrying')onStatus('retrying');
    else if(normalized==='processing')onStatus('processing');
    else onStatus('queued');
  }
  onStatus('failed');
  throw new Error('Asset processing timed out. Check the worker and job status.');
}
