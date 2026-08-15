import {Prisma,PrismaClient} from '@prisma/client';
import {createClient} from '@supabase/supabase-js';
import {Job as BullJob,Worker} from 'bullmq';

const QUEUE='ai-visualization';
const db=new PrismaClient();
type Data={databaseJobId:string;aiRequestId:string;projectId:string;userId:string;inputObjectKey:string;prompt:string};
type OpenAiImageResponse={data?:Array<{b64_json?:string}>;error?:{message?:string}};

function env(name:string,fallback?:string){const value=process.env[name]??fallback;if(!value)throw new Error(`Missing ${name}`);return value;}
function redis(){const url=new URL(process.env.REDIS_URL??'redis://localhost:6379');return{host:url.hostname,port:Number(url.port||6379),username:url.username||undefined,password:url.password||undefined,db:url.pathname.length>1?Number(url.pathname.slice(1)):0,tls:url.protocol==='rediss:'?{}:undefined,maxRetriesPerRequest:null};}
const bucket=env('SUPABASE_STORAGE_BUCKET','product3d');
const storage=createClient(env('SUPABASE_URL'),env('SUPABASE_SECRET_KEY'),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

async function generateVisualization(input:Blob,prompt:string){
  const form=new FormData();
  form.set('model',process.env.OPENAI_VISUALIZATION_MODEL??'gpt-image-2');
  form.set('prompt',`Create a photorealistic lifestyle/catalog visualization using the supplied product render as the product reference. Preserve the product's geometry, proportions, materials, colors, and identity. Do not redesign or add/remove product parts. Change only the environment, lighting, staging, and photographic presentation as requested. User request: ${prompt}`);
  form.set('image',input,'product-reference.png');
  form.set('size',process.env.OPENAI_VISUALIZATION_SIZE??'1536x1024');
  form.set('quality',process.env.OPENAI_VISUALIZATION_QUALITY??'medium');
  form.set('output_format','png');
  const response=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${env('OPENAI_API_KEY')}`},body:form});
  const json=await response.json() as OpenAiImageResponse;
  if(!response.ok)throw new Error(json.error?.message??`OpenAI image edit failed (${response.status})`);
  const base64=json.data?.[0]?.b64_json;
  if(!base64)throw new Error('OpenAI image edit returned no image data.');
  return Buffer.from(base64,'base64');
}

async function processJob(job:BullJob<Data>){
  const d=job.data;
  await db.$transaction([
    db.job.update({where:{id:d.databaseJobId},data:{status:'PROCESSING',failureReason:null}}),
    db.aIRequest.update({where:{id:d.aiRequestId},data:{status:'PROCESSING',error:null}}),
  ]);
  try{
    const source=await storage.storage.from(bucket).download(d.inputObjectKey);
    if(source.error||!source.data)throw source.error??new Error('Visualization input render not found.');
    const png=await generateVisualization(source.data,d.prompt);
    const objectKey=`ai-visualizations/${d.userId}/${d.projectId}/${d.aiRequestId}.png`;
    const uploaded=await storage.storage.from(bucket).upload(objectKey,png,{contentType:'image/png',upsert:false});
    if(uploaded.error)throw uploaded.error;
    const result={objectKey,filename:`visualization-${d.aiRequestId}.png`,contentType:'image/png',provider:'openai',model:process.env.OPENAI_VISUALIZATION_MODEL??'gpt-image-2'};
    await db.$transaction([
      db.aIRequest.update({where:{id:d.aiRequestId},data:{status:'COMPLETED',provider:'openai',model:result.model,resultJson:result as Prisma.InputJsonValue,error:null}}),
      db.job.update({where:{id:d.databaseJobId},data:{status:'COMPLETED',result:result as Prisma.InputJsonValue,failureReason:null}}),
    ]);
    return result;
  }catch(error){
    const message=error instanceof Error?error.message:String(error),retry=job.attemptsMade+1<(job.opts.attempts??1);
    await db.$transaction([
      db.job.update({where:{id:d.databaseJobId},data:{status:retry?'RETRYING':'FAILED',failureReason:message}}),
      db.aIRequest.update({where:{id:d.aiRequestId},data:{status:retry?'PROCESSING':'FAILED',error:message}}),
    ]);
    throw error;
  }
}

const worker=new Worker<Data>(QUEUE,processJob,{connection:redis(),concurrency:Number(process.env.AI_VISUALIZATION_WORKER_CONCURRENCY??1)});
worker.on('completed',job=>console.info(`[ai-visualization-worker] completed ${job.id}`));
worker.on('failed',(job,error)=>console.error(`[ai-visualization-worker] failed ${job?.id??'unknown'}: ${error.message}`));
async function shutdown(){await worker.close();await db.$disconnect();process.exit(0);}process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
console.info(`[ai-visualization-worker] listening on ${QUEUE}`);
