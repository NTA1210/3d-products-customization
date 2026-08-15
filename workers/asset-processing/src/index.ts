import { Accessor, Document, NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune } from '@gltf-transform/functions';
import { Prisma, PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { Job as BullJob, Worker } from 'bullmq';
import * as draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import validator from 'gltf-validator';

const QUEUE_NAME = 'asset-processing';
const GL_TRIANGLES = 4;
const prisma = new PrismaClient();

type AssetProcessingJobData = { assetId:string;databaseJobId:string;sourceObjectKey:string;originalFilename:string };
type Warning={code:string;severity:'INFO'|'WARNING'|'ERROR';message:string;sourceId?:string};
type Bounds={min:[number,number,number];max:[number,number,number]};

function requiredEnv(name:string,fallback?:string){const value=process.env[name]??fallback;if(!value)throw new Error(`Missing required environment variable: ${name}`);return value;}
function pad(value:number,size=4){return String(value).padStart(size,'0');}
function nodeId(index:number){return `node_${pad(index)}`;}
function meshId(index:number){return `mesh_${pad(index)}`;}
function primitiveId(meshIndex:number,primitiveIndex:number){return `${meshId(meshIndex)}_prim_${pad(primitiveIndex,2)}`;}

function redisConnection(){const url=new URL(process.env.REDIS_URL??'redis://localhost:6379');const dbPath=url.pathname.replace(/^\//,'');return{host:url.hostname,port:Number(url.port||6379),username:url.username?decodeURIComponent(url.username):undefined,password:url.password?decodeURIComponent(url.password):undefined,db:dbPath?Number(dbPath):0,tls:url.protocol==='rediss:'?{}:undefined,maxRetriesPerRequest:null};}

const supabase=createClient(requiredEnv('SUPABASE_URL'),requiredEnv('SUPABASE_SECRET_KEY'),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const bucket=requiredEnv('SUPABASE_STORAGE_BUCKET','product3d');

async function downloadObject(key:string){const{data,error}=await supabase.storage.from(bucket).download(key);if(error||!data)throw error??new Error(`Supabase object ${key} has an empty response body.`);return new Uint8Array(await data.arrayBuffer());}
async function uploadObject(key:string,bytes:Uint8Array){const{error}=await supabase.storage.from(bucket).upload(key,bytes,{contentType:'model/gltf-binary',cacheControl:'3600',upsert:true});if(error)throw error;}

async function validateGlb(bytes:Uint8Array,uri:string){const report=await validator.validateBytes(bytes,{uri,format:'glb',maxIssues:5000});if(report.issues.numErrors>0)throw new Error(`glTF validation failed with ${report.issues.numErrors} error(s).`);return report;}
async function createNodeIo(){await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);const[decoder,encoder]=await Promise.all([draco3d.createDecoderModule(),draco3d.createEncoderModule()]);return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':decoder,'draco3d.encoder':encoder,'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});}

function accessorBounds(position:Accessor,vertices:Set<number>):Bounds|undefined{
  const array=position.getArray();const stride=position.getElementSize();if(!array||stride<3||vertices.size===0)return undefined;
  const min:[number,number,number]=[Infinity,Infinity,Infinity],max:[number,number,number]=[-Infinity,-Infinity,-Infinity];
  for(const vertex of vertices){const offset=vertex*stride;for(let axis=0;axis<3;axis+=1){const value=Number(array[offset+axis]);min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value);}}
  return Number.isFinite(min[0])?{min,max}:undefined;
}

function analyzePrimitive(primitive:Primitive,sourceMeshId:string,sourcePrimitiveId:string,primitiveIndex:number,warnings:Warning[]){
  const position=primitive.getAttribute('POSITION');const indices=primitive.getIndices();const mode=primitive.getMode();
  const hasMaterial=Boolean(primitive.getMaterial()),hasUv=Boolean(primitive.getAttribute('TEXCOORD_0'));
  if(!position)return{id:sourcePrimitiveId,primitiveIndex,mode,triangleCount:0,vertexCount:0,hasMaterial,hasUv,regions:[]};
  if(!hasMaterial)warnings.push({code:'MISSING_MATERIAL',severity:'WARNING',message:'Primitive has no material assigned.',sourceId:sourcePrimitiveId});
  if(!hasUv)warnings.push({code:'MISSING_UV',severity:'INFO',message:'Primitive has no TEXCOORD_0 UV attribute.',sourceId:sourcePrimitiveId});
  const vertexCount=position.getCount();
  if(mode!==GL_TRIANGLES){warnings.push({code:'NON_TRIANGLE_PRIMITIVE',severity:'INFO',message:`Primitive mode ${mode} is not analyzed for disconnected triangle islands.`,sourceId:sourcePrimitiveId});return{id:sourcePrimitiveId,primitiveIndex,mode,triangleCount:0,vertexCount,hasMaterial,hasUv,regions:[]};}
  const rawIndices=indices?.getArray();const elementCount=indices?.getCount()??vertexCount;const triangleCount=Math.floor(elementCount/3);
  const parent=Array.from({length:triangleCount},(_,index)=>index);const firstTriangleByVertex=new Map<number,number>();
  const find=(value:number):number=>{while(parent[value]!==value){parent[value]=parent[parent[value]];value=parent[value];}return value;};
  const union=(left:number,right:number)=>{left=find(left);right=find(right);if(left!==right)parent[right]=left;};
  const vertexAt=(index:number)=>rawIndices?Number(rawIndices[index]):index;
  for(let triangle=0;triangle<triangleCount;triangle+=1){for(let corner=0;corner<3;corner+=1){const vertex=vertexAt(triangle*3+corner);const previous=firstTriangleByVertex.get(vertex);if(previous===undefined)firstTriangleByVertex.set(vertex,triangle);else union(triangle,previous);}}
  const groups=new Map<number,number[]>();for(let triangle=0;triangle<triangleCount;triangle+=1){const root=find(triangle);const group=groups.get(root)??[];group.push(triangle);groups.set(root,group);}
  const regions=Array.from(groups.values()).sort((a,b)=>a[0]-b[0]).map((triangles,islandIndex)=>{const vertices=new Set<number>();for(const triangle of triangles)for(let corner=0;corner<3;corner+=1)vertices.add(vertexAt(triangle*3+corner));return{id:`${sourcePrimitiveId}_island_${pad(islandIndex,3)}`,sourceMeshId,sourcePrimitiveId,islandIndex,triangleCount:triangles.length,vertexCount:vertices.size,bounds:accessorBounds(position,vertices)};});
  return{id:sourcePrimitiveId,primitiveIndex,mode,triangleCount,vertexCount,hasMaterial,hasUv,regions};
}

function pushDuplicateNameWarnings(names:Array<{name:string;id:string;kind:string}>,warnings:Warning[]){const buckets=new Map<string,Array<{id:string;kind:string}>>();for(const item of names){const name=item.name.trim();if(!name)continue;const list=buckets.get(name)??[];list.push({id:item.id,kind:item.kind});buckets.set(name,list);}for(const[name,items]of buckets)if(items.length>1)warnings.push({code:'DUPLICATE_NAME',severity:'INFO',message:`Name "${name}" is used by ${items.length} source objects. Names are display labels, not business IDs.`});}

function analyzeDocument(document:Document){
  const root=document.getRoot(),nodes=root.listNodes(),meshes=root.listMeshes();const warnings:Warning[]=[];const names:Array<{name:string;id:string;kind:string}>=[];
  const meshIndexByObject=new Map(meshes.map((mesh,index)=>[mesh,index] as const));
  nodes.forEach((node,index)=>{names.push({name:node.getName(),id:nodeId(index),kind:'node'});if(!node.getMesh()&&node.listChildren().length===0)warnings.push({code:'EMPTY_NODE',severity:'INFO',message:'Node has no mesh and no children.',sourceId:nodeId(index)});});
  meshes.forEach((mesh,index)=>names.push({name:mesh.getName(),id:meshId(index),kind:'mesh'}));pushDuplicateNameWarnings(names,warnings);
  const meshAnalysis=meshes.map((mesh,meshIndex)=>{
    const sourceMeshId=meshId(meshIndex);const sourceNodeIds=nodes.map((node,index)=>node.getMesh()===mesh?nodeId(index):undefined).filter((value):value is string=>Boolean(value));
    const primitives=mesh.listPrimitives().map((primitive,primitiveIndex)=>analyzePrimitive(primitive,sourceMeshId,primitiveId(meshIndex,primitiveIndex),primitiveIndex,warnings));
    return{id:sourceMeshId,meshIndex,name:mesh.getName()||`Mesh ${meshIndex+1}`,sourceNodeIds,primitives};
  });
  const componentCandidates=[] as Array<{id:string;name:string;sourceNodeId:string;sourceMeshId:string;sourcePrimitiveId:string;regionIds:string[];semanticStatus:'UNCONFIRMED'}>;
  nodes.forEach((node,nodeIndex)=>{const mesh=node.getMesh();if(!mesh)return;const meshIndex=meshIndexByObject.get(mesh);if(meshIndex===undefined)return;mesh.listPrimitives().forEach((_primitive,primitiveIndex)=>{const sourcePrimitiveId=primitiveId(meshIndex,primitiveIndex);const primitive=meshAnalysis[meshIndex].primitives[primitiveIndex];componentCandidates.push({id:`cmp_${nodeId(nodeIndex)}_${meshId(meshIndex)}_prim_${pad(primitiveIndex,2)}`,name:node.getName()||mesh.getName()||`Component ${nodeIndex+1}`,sourceNodeId:nodeId(nodeIndex),sourceMeshId:meshId(meshIndex),sourcePrimitiveId,regionIds:primitive?.regions.map(region=>region.id)??[],semanticStatus:'UNCONFIRMED'});});});
  const primitiveCount=meshAnalysis.reduce((sum,mesh)=>sum+mesh.primitives.length,0);const triangles=meshAnalysis.reduce((sum,mesh)=>sum+mesh.primitives.reduce((value,primitive)=>value+primitive.triangleCount,0),0);const regionCount=meshAnalysis.reduce((sum,mesh)=>sum+mesh.primitives.reduce((value,primitive)=>value+primitive.regions.length,0),0);
  if(meshes.length===1)warnings.push({code:'ONE_MESH_ONLY',severity:'WARNING',message:'This asset contains only one source mesh. Semantic parts are not assumed.'});
  if(meshes.length===1&&regionCount>1)warnings.push({code:'DISCONNECTED_GEOMETRY_ISLANDS',severity:'INFO',message:`The source mesh contains ${regionCount} disconnected geometry islands. They are geometry candidates only and require Asset Preparation review.`,sourceId:meshId(0)});
  if(meshes.length===1&&regionCount===1)warnings.push({code:'SINGLE_CONTINUOUS_MESH',severity:'WARNING',message:'This asset is a single continuous mesh. The editor will fall back to whole-component editing unless the user prepares additional regions.',sourceId:meshId(0)});
  const threshold=Number(process.env.ASSET_TRIANGLE_WARNING_THRESHOLD??500000);if(triangles>threshold)warnings.push({code:'TRIANGLE_COUNT_HIGH',severity:'WARNING',message:`Asset contains ${triangles} triangles, above the configured warning threshold ${threshold}.`});
  return{version:1 as const,unitScaleToMm:1000,stats:{nodes:nodes.length,meshes:meshes.length,primitives:primitiveCount,triangles,materials:root.listMaterials().length,textures:root.listTextures().length},meshes:meshAnalysis,componentCandidates,warnings};
}

async function normalizeAndAnalyze(bytes:Uint8Array){const directory=await mkdtemp(join(tmpdir(),'product3d-asset-'));const sourcePath=join(directory,'source.glb');try{await writeFile(sourcePath,bytes);const io=await createNodeIo();const document=await io.read(sourcePath);const analysis=analyzeDocument(document);const root=document.getRoot();const statsBefore={scenes:root.listScenes().length,nodes:root.listNodes().length,meshes:root.listMeshes().length,materials:root.listMaterials().length,textures:root.listTextures().length};await document.transform(prune(),dedup());const normalized=await io.writeBinary(document);const normalizedRoot=document.getRoot();return{normalized,analysis,statsBefore,statsAfter:{scenes:normalizedRoot.listScenes().length,nodes:normalizedRoot.listNodes().length,meshes:normalizedRoot.listMeshes().length,materials:normalizedRoot.listMaterials().length,textures:normalizedRoot.listTextures().length}};}finally{await rm(directory,{recursive:true,force:true});}}

async function processAsset(job:BullJob<AssetProcessingJobData>){const{assetId,databaseJobId,sourceObjectKey,originalFilename}=job.data;await prisma.$transaction([prisma.job.update({where:{id:databaseJobId},data:{status:'PROCESSING',failureReason:null}}),prisma.modelAsset.update({where:{id:assetId},data:{status:'PROCESSING'}})]);try{const sourceBytes=await downloadObject(sourceObjectKey);const sourceReport=await validateGlb(sourceBytes,originalFilename);const{normalized,analysis,statsBefore,statsAfter}=await normalizeAndAnalyze(sourceBytes);const normalizedReport=await validateGlb(normalized,'normalized.glb');const normalizedObjectKey=`assets/${assetId}/normalized/model.glb`;await uploadObject(normalizedObjectKey,normalized);const result:Prisma.InputJsonObject={normalizedObjectKey,analysis:analysis as unknown as Prisma.InputJsonValue,sourceValidation:{errors:sourceReport.issues.numErrors,warnings:sourceReport.issues.numWarnings,infos:sourceReport.issues.numInfos,hints:sourceReport.issues.numHints},normalizedValidation:{errors:normalizedReport.issues.numErrors,warnings:normalizedReport.issues.numWarnings,infos:normalizedReport.issues.numInfos,hints:normalizedReport.issues.numHints},statsBefore,statsAfter};await prisma.$transaction([prisma.modelAsset.update({where:{id:assetId},data:{status:'READY',normalizedObjectKey,normalizedGlbUrl:`supabase://${bucket}/${normalizedObjectKey}`,validationJson:sourceReport as unknown as Prisma.InputJsonValue,analysisJson:analysis as unknown as Prisma.InputJsonValue,analysisVersion:1}}),prisma.job.update({where:{id:databaseJobId},data:{status:'COMPLETED',result,failureReason:null}})]);return result;}catch(error){const message=error instanceof Error?error.message:String(error);const maxAttempts=job.opts.attempts??1;const willRetry=job.attemptsMade+1<maxAttempts;await prisma.$transaction([prisma.job.update({where:{id:databaseJobId},data:{status:willRetry?'RETRYING':'FAILED',failureReason:message}}),prisma.modelAsset.update({where:{id:assetId},data:{status:willRetry?'QUEUED':'FAILED'}})]);throw error;}}

const worker=new Worker<AssetProcessingJobData>(QUEUE_NAME,processAsset,{connection:redisConnection(),concurrency:Number(process.env.ASSET_WORKER_CONCURRENCY??2)});worker.on('completed',job=>console.info(`[asset-worker] completed ${job.id}`));worker.on('failed',(job,error)=>console.error(`[asset-worker] failed ${job?.id??'unknown'}: ${error.message}`));async function shutdown(signal:string){console.info(`[asset-worker] ${signal}: shutting down`);await worker.close();await prisma.$disconnect();process.exit(0);}process.on('SIGTERM',()=>void shutdown('SIGTERM'));process.on('SIGINT',()=>void shutdown('SIGINT'));console.info(`[asset-worker] listening on queue ${QUEUE_NAME}`);
