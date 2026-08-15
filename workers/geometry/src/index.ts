import {Prisma,PrismaClient} from '@prisma/client';
import {createClient} from '@supabase/supabase-js';
import {Job as BullJob,Worker} from 'bullmq';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const QUEUE='geometry-analysis';
const db=new PrismaClient();
type Data={databaseJobId:string;manufacturingCheckId:string;projectId:string;userId:string;sourceObjectKey:string};
type AnalyzerResult={facts:Record<string,unknown>;issues:Array<Record<string,unknown>>};
function env(name:string,fallback?:string){const value=process.env[name]??fallback;if(!value)throw new Error(`Missing ${name}`);return value;}
function redis(){const url=new URL(process.env.REDIS_URL??'redis://localhost:6379');return{host:url.hostname,port:Number(url.port||6379),username:url.username||undefined,password:url.password||undefined,db:url.pathname.length>1?Number(url.pathname.slice(1)):0,tls:url.protocol==='rediss:'?{}:undefined,maxRetriesPerRequest:null};}
const bucket=env('SUPABASE_STORAGE_BUCKET','product3d');
const storage=createClient(env('SUPABASE_URL'),env('SUPABASE_SECRET_KEY'),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const here=dirname(fileURLToPath(import.meta.url));

function runAnalyzer(path:string){return new Promise<AnalyzerResult>((resolve,reject)=>{const python=process.env.PYTHON_BIN??'python3',script=join(here,'..','analyze.py'),child=spawn(python,[script,path],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',c=>stdout+=String(c));child.stderr.on('data',c=>stderr+=String(c));child.on('error',reject);child.on('close',code=>{if(code!==0)return reject(new Error(`Trimesh analyzer exited ${code}: ${stderr.slice(-4000)}`));try{resolve(JSON.parse(stdout) as AnalyzerResult)}catch{return reject(new Error(`Trimesh analyzer returned invalid JSON: ${stdout.slice(0,1000)}`));}});});}

async function processJob(job:BullJob<Data>){
  const d=job.data,temp=await mkdtemp(join(tmpdir(),'product3d-geometry-'));
  await db.job.update({where:{id:d.databaseJobId},data:{status:'PROCESSING',failureReason:null}});
  try{
    const downloaded=await storage.storage.from(bucket).download(d.sourceObjectKey);
    if(downloaded.error||!downloaded.data)throw downloaded.error??new Error('Export GLB not found');
    const model=join(temp,'model.glb');await writeFile(model,new Uint8Array(await downloaded.data.arrayBuffer()));
    const analysis=await runAnalyzer(model);
    const check=await db.manufacturingCheck.findUniqueOrThrow({where:{id:d.manufacturingCheckId}});
    const existing=Array.isArray(check.issuesJson)?check.issuesJson:[];
    const issues=[...existing,...analysis.issues] as Prisma.InputJsonValue;
    await db.$transaction([
      db.manufacturingCheck.update({where:{id:d.manufacturingCheckId},data:{status:'COMPLETED',geometryJson:analysis.facts as Prisma.InputJsonValue,issuesJson:issues}}),
      db.job.update({where:{id:d.databaseJobId},data:{status:'COMPLETED',result:analysis as unknown as Prisma.InputJsonValue,failureReason:null}}),
    ]);
    return analysis;
  }catch(error){
    const message=error instanceof Error?error.message:String(error),retry=job.attemptsMade+1<(job.opts.attempts??1);
    await db.$transaction([
      db.job.update({where:{id:d.databaseJobId},data:{status:retry?'RETRYING':'FAILED',failureReason:message}}),
      db.manufacturingCheck.update({where:{id:d.manufacturingCheckId},data:{status:retry?'PROCESSING':'FAILED'}}),
    ]);
    throw error;
  }finally{await rm(temp,{recursive:true,force:true});}
}

const worker=new Worker<Data>(QUEUE,processJob,{connection:redis(),concurrency:Number(process.env.GEOMETRY_WORKER_CONCURRENCY??1)});
worker.on('completed',job=>console.info(`[geometry-worker] completed ${job.id}`));
worker.on('failed',(job,error)=>console.error(`[geometry-worker] failed ${job?.id??'unknown'}: ${error.message}`));
async function shutdown(){await worker.close();await db.$disconnect();process.exit(0);}process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
console.info(`[geometry-worker] listening on ${QUEUE}`);
