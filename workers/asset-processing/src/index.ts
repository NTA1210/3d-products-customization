import {Accessor,Document,NodeIO,Primitive} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune} from '@gltf-transform/functions';
import {Prisma,PrismaClient} from '@prisma/client';
import {analyzeTriangleTopology} from '@product3d/geometry-topology';
import {createClient} from '@supabase/supabase-js';
import {Job as BullJob,Worker} from 'bullmq';
import * as draco3d from 'draco3dgltf';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import validator from 'gltf-validator';
import {applyProductScenePolicy,assertSupportedRequiredExtensions,type GltfPolicyWarning} from './gltf-policy.js';
import {collectModelQualityWarnings} from './quality.js';

const QUEUE_NAME='asset-processing';
const GL_TRIANGLES=4;
const prisma=new PrismaClient();
type AssetProcessingJobData={assetId:string;databaseJobId:string;sourceObjectKey:string;originalFilename:string};
type Warning={code:string;severity:'INFO'|'WARNING'|'ERROR';message:string;sourceId?:string};
type Bounds={min:[number,number,number];max:[number,number,number]};

function requiredEnv(name:string,fallback?:string){const value=process.env[name]??fallback;if(!value)throw new Error(`Missing required environment variable: ${name}`);return value;}
function pad(value:number,size=4){return String(value).padStart(size,'0');}
function nodeId(index:number){return`node_${pad(index)}`;}
function meshId(index:number){return`mesh_${pad(index)}`;}
function primitiveId(meshIndex:number,primitiveIndex:number){return`${meshId(meshIndex)}_prim_${pad(primitiveIndex,2)}`;}
function qualityOptions(){return{textureResolutionThreshold:Number(process.env.ASSET_TEXTURE_RESOLUTION_WARNING_THRESHOLD??4096),textureBytesThreshold:Number(process.env.ASSET_TEXTURE_BYTES_WARNING_THRESHOLD??16777216),rootScaleMin:Number(process.env.ASSET_ROOT_SCALE_MIN??.001),rootScaleMax:Number(process.env.ASSET_ROOT_SCALE_MAX??1000)};}
function redisConnection(){const url=new URL(process.env.REDIS_URL??'redis://localhost:6379');const dbPath=url.pathname.replace(/^\//,'');return{host:url.hostname,port:Number(url.port||6379),username:url.username?decodeURIComponent(url.username):undefined,password:url.password?decodeURIComponent(url.password):undefined,db:dbPath?Number(dbPath):0,tls:url.protocol==='rediss:'?{}:undefined,maxRetriesPerRequest:null};}

const supabase=createClient(requiredEnv('SUPABASE_URL'),requiredEnv('SUPABASE_SECRET_KEY'),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const bucket=requiredEnv('SUPABASE_STORAGE_BUCKET','product3d');
async function downloadObject(key:string){const{data,error}=await supabase.storage.from(bucket).download(key);if(error||!data)throw error??new Error(`Supabase object ${key} has an empty response body.`);return new Uint8Array(await data.arrayBuffer());}
async function uploadObject(key:string,bytes:Uint8Array){const{error}=await supabase.storage.from(bucket).upload(key,bytes,{contentType:'model/gltf-binary',cacheControl:'3600',upsert:true});if(error)throw error;}
async function validateGlb(bytes:Uint8Array,uri:string){assertSupportedRequiredExtensions(bytes);const report=await validator.validateBytes(bytes,{uri,format:'glb',maxIssues:5000});if(report.issues.numErrors>0)throw new Error(`glTF validation failed with ${report.issues.numErrors} error(s).`);return report;}
async function createNodeIo(){await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);const[decoder,encoder]=await Promise.all([draco3d.createDecoderModule(),draco3d.createEncoderModule()]);return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':decoder,'draco3d.encoder':encoder,'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});}

function accessorBounds(position:Accessor,vertices:Set<number>):Bounds|undefined{const array=position.getArray();const stride=position.getElementSize();if(!array||stride<3||vertices.size===0)return undefined;const min:[number,number,number]=[Infinity,Infinity,Infinity],max:[number,number,number]=[-Infinity,-Infinity,-Infinity];for(const vertex of vertices){const offset=vertex*stride;for(let axis=0;axis<3;axis+=1){const value=Number(array[offset+axis]);min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value);}}return Number.isFinite(min[0])?{min,max}:undefined;}

function analyzePrimitive(primitive:Primitive,sourceMeshId:string,sourcePrimitiveId:string,primitiveIndex:number,warnings:Warning[]){
  const position=primitive.getAttribute('POSITION');
  const indices=primitive.getIndices();
  const mode=primitive.getMode();
  const hasMaterial=Boolean(primitive.getMaterial());
  const hasUv=Boolean(primitive.getAttribute('TEXCOORD_0'));
  if(!position){warnings.push({code:'MISSING_POSITION',severity:'WARNING',message:'Primitive has no POSITION attribute and cannot be used as an editable surface.',sourceId:sourcePrimitiveId});return{id:sourcePrimitiveId,primitiveIndex,mode,triangleCount:0,vertexCount:0,hasMaterial,hasUv,regions:[]};}
  if(!hasMaterial)warnings.push({code:'MISSING_MATERIAL',severity:'WARNING',message:'Primitive has no material assigned.',sourceId:sourcePrimitiveId});
  if(!hasUv)warnings.push({code:'MISSING_UV',severity:'INFO',message:'Primitive has no TEXCOORD_0 UV attribute.',sourceId:sourcePrimitiveId});
  const vertexCount=position.getCount();
  if(mode!==GL_TRIANGLES){warnings.push({code:'NON_TRIANGLE_PRIMITIVE',severity:'WARNING',message:`Primitive mode ${mode} is preserved for viewing but is not auto-componentized.`,sourceId:sourcePrimitiveId});return{id:sourcePrimitiveId,primitiveIndex,mode,triangleCount:0,vertexCount,hasMaterial,hasUv,regions:[]};}
  const positionArray=position.getArray();
  if(!positionArray){warnings.push({code:'POSITION_ARRAY_UNAVAILABLE',severity:'WARNING',message:'Primitive POSITION data is unavailable after decoding.',sourceId:sourcePrimitiveId});return{id:sourcePrimitiveId,primitiveIndex,mode,triangleCount:0,vertexCount,hasMaterial,hasUv,regions:[]};}
  const topology=analyzeTriangleTopology({positions:positionArray,positionStride:position.getElementSize(),indices:indices?.getArray()??null});
  if(!topology.indexed)warnings.push({code:'NON_INDEXED_GEOMETRY',severity:'INFO',message:'Primitive is non-indexed. Connectivity was reconstructed by welding coincident positions before detecting geometry regions.',sourceId:sourcePrimitiveId});
  if(topology.degenerateTriangleCount>0)warnings.push({code:'DEGENERATE_TRIANGLES',severity:'INFO',message:`${topology.degenerateTriangleCount} degenerate triangle(s) were detected.`,sourceId:sourcePrimitiveId});
  if(topology.invalidTriangleCount>0)warnings.push({code:'INVALID_TRIANGLE_INDEX',severity:'WARNING',message:`${topology.invalidTriangleCount} triangle(s) referenced invalid vertices and were excluded from topology candidates.`,sourceId:sourcePrimitiveId});
  const regions=topology.regions.map(region=>({id:`${sourcePrimitiveId}_island_${pad(region.islandIndex,3)}`,sourceMeshId,sourcePrimitiveId,islandIndex:region.islandIndex,triangleCount:region.triangleCount,vertexCount:region.vertexCount,bounds:region.bounds}));
  return{id:sourcePrimitiveId,primitiveIndex,mode,triangleCount:topology.triangleCount,vertexCount,hasMaterial,hasUv,regions};
}

function pushDuplicateNameWarnings(names:Array<{name:string;id:string;kind:string}>,warnings:Warning[]){const buckets=new Map<string,Array<{id:string;kind:string}>>();for(const item of names){const name=item.name.trim();if(!name)continue;const list=buckets.get(name)??[];list.push({id:item.id,kind:item.kind});buckets.set(name,list);}for(const[name,items]of buckets){if(items.length>1)warnings.push({code:'DUPLICATE_NAME',severity:'INFO',message:`Name "${name}" is used by ${items.length} source objects. Names are display labels, not business IDs.`});}}

function analyzeDocument(document:Document,policyWarnings:GltfPolicyWarning[]=[]){
  const root=document.getRoot();
  const nodes=root.listNodes();
  const meshes=root.listMeshes();
  const warnings:Warning[]=[...policyWarnings];
  const names:Array<{name:string;id:string;kind:string}>=[];
  warnings.push(...collectModelQualityWarnings(nodes,root.listTextures(),qualityOptions()));
  const meshIndexByObject=new Map(meshes.map((mesh,index)=>[mesh,index] as const));
  nodes.forEach((node,index)=>{names.push({name:node.getName(),id:nodeId(index),kind:'node'});if(!node.getMesh()&&node.listChildren().length===0)warnings.push({code:'EMPTY_NODE',severity:'INFO',message:'Node has no mesh and no children.',sourceId:nodeId(index)});});
  meshes.forEach((mesh,index)=>names.push({name:mesh.getName(),id:meshId(index),kind:'mesh'}));
  pushDuplicateNameWarnings(names,warnings);

  const hasSkins=root.listSkins().length>0;
  const hasAnimations=root.listAnimations().length>0;
  const hasMorphTargets=meshes.some(mesh=>mesh.listPrimitives().some(primitive=>primitive.listTargets().length>0));
  if(hasSkins)warnings.push({code:'SKINNED_GEOMETRY_PRESENT',severity:'WARNING',message:'Skinned geometry is present. Automatic geometry-island componentization is disabled for animated/skinned parts; keep those parts source-aligned unless explicitly prepared.'});
  if(hasMorphTargets)warnings.push({code:'MORPH_TARGETS_PRESENT',severity:'WARNING',message:'Morph targets are present. Automatic geometry-island componentization is disabled for morph-driven parts to preserve deformation behavior.'});
  if(hasAnimations)warnings.push({code:'ANIMATIONS_PRESENT',severity:'INFO',message:'Animations are present. Editing node transforms may conflict with animation channels; animated parts require explicit preparation.'});

  const meshAnalysis=meshes.map((mesh,meshIndex)=>{const sourceMeshId=meshId(meshIndex);const sourceNodeIds=nodes.map((node,index)=>node.getMesh()===mesh?nodeId(index):undefined).filter((value):value is string=>Boolean(value));const primitives=mesh.listPrimitives().map((primitive,primitiveIndex)=>analyzePrimitive(primitive,sourceMeshId,primitiveId(meshIndex,primitiveIndex),primitiveIndex,warnings));return{id:sourceMeshId,meshIndex,name:mesh.getName()||`Mesh ${meshIndex+1}`,sourceNodeIds,primitives};});

  const componentCandidates=[] as Array<{id:string;name:string;sourceNodeId:string;sourceMeshId:string;sourcePrimitiveId:string;regionIds:string[];semanticStatus:'UNCONFIRMED'}>;
  nodes.forEach((node,nodeIndex)=>{const mesh=node.getMesh();if(!mesh)return;const meshIndex=meshIndexByObject.get(mesh);if(meshIndex===undefined)return;mesh.listPrimitives().forEach((_primitive,primitiveIndex)=>{const sourcePrimitiveId=primitiveId(meshIndex,primitiveIndex);const primitive=meshAnalysis[meshIndex].primitives[primitiveIndex];componentCandidates.push({id:`cmp_${nodeId(nodeIndex)}_${meshId(meshIndex)}_prim_${pad(primitiveIndex,2)}`,name:node.getName()||mesh.getName()||`Component ${nodeIndex+1}`,sourceNodeId:nodeId(nodeIndex),sourceMeshId:meshId(meshIndex),sourcePrimitiveId,regionIds:primitive?.regions.map(region=>region.id)??[],semanticStatus:'UNCONFIRMED'});});});

  const primitiveCount=meshAnalysis.reduce((sum,mesh)=>sum+mesh.primitives.length,0);
  const triangles=meshAnalysis.reduce((sum,mesh)=>sum+mesh.primitives.reduce((value,primitive)=>value+primitive.triangleCount,0),0);
  const regionCount=meshAnalysis.reduce((sum,mesh)=>sum+mesh.primitives.reduce((value,primitive)=>value+primitive.regions.length,0),0);
  const maxAutoRegions=Number(process.env.ASSET_MAX_AUTO_REGIONS??32);
  if(meshes.length===1)warnings.push({code:'ONE_MESH_ONLY',severity:'WARNING',message:'This asset contains only one source mesh. Semantic parts are not assumed; geometry regions are candidates that require preparation review.'});
  if(meshes.length===1&&regionCount>1&&regionCount<=maxAutoRegions&&!hasSkins&&!hasMorphTargets)warnings.push({code:'DISCONNECTED_GEOMETRY_ISLANDS',severity:'INFO',message:`The source mesh contains ${regionCount} disconnected geometry islands. They are safe geometry candidates for manual component preparation, not semantic labels.`,sourceId:meshId(0)});
  if(meshes.length===1&&regionCount>maxAutoRegions)warnings.push({code:'TOO_MANY_GEOMETRY_REGIONS',severity:'WARNING',message:`The source mesh contains ${regionCount} disconnected geometry islands, above the safe auto-componentization limit ${maxAutoRegions}. Keep the source component intact and review/author components manually instead of creating hundreds of parts.`,sourceId:meshId(0)});
  if(meshes.length===1&&regionCount===1)warnings.push({code:'SINGLE_CONTINUOUS_MESH',severity:'WARNING',message:'This asset is a single continuous mesh. The editor falls back to whole-component editing; semantic sub-parts cannot be inferred safely from topology alone.',sourceId:meshId(0)});
  const threshold=Number(process.env.ASSET_TRIANGLE_WARNING_THRESHOLD??500000);
  if(triangles>threshold)warnings.push({code:'TRIANGLE_COUNT_HIGH',severity:'WARNING',message:`Asset contains ${triangles} triangles, above the configured warning threshold ${threshold}.`});
  return{version:1 as const,unitScaleToMm:1000,stats:{nodes:nodes.length,meshes:meshes.length,primitives:primitiveCount,triangles,materials:root.listMaterials().length,textures:root.listTextures().length},meshes:meshAnalysis,componentCandidates,warnings};
}

async function normalizeAndAnalyze(bytes:Uint8Array){
  const directory=await mkdtemp(join(tmpdir(),'product3d-asset-'));
  const sourcePath=join(directory,'source.glb');
  try{
    await writeFile(sourcePath,bytes);
    const io=await createNodeIo();
    const document=await io.read(sourcePath);
    const policyWarnings=applyProductScenePolicy(document);
    const analysis=analyzeDocument(document,policyWarnings);
    const root=document.getRoot();
    const statsBefore={scenes:root.listScenes().length,nodes:root.listNodes().length,meshes:root.listMeshes().length,materials:root.listMaterials().length,textures:root.listTextures().length};
    await document.transform(prune(),dedup());
    const normalized=await io.writeBinary(document);
    const normalizedRoot=document.getRoot();
    return{normalized,analysis,statsBefore,statsAfter:{scenes:normalizedRoot.listScenes().length,nodes:normalizedRoot.listNodes().length,meshes:normalizedRoot.listMeshes().length,materials:normalizedRoot.listMaterials().length,textures:normalizedRoot.listTextures().length}};
  }finally{await rm(directory,{recursive:true,force:true});}
}

async function processAsset(job:BullJob<AssetProcessingJobData>){
  const startedAt=Date.now();
  const{assetId,databaseJobId,sourceObjectKey,originalFilename}=job.data;
  console.info(JSON.stringify({event:'asset_analysis_started',assetId,jobId:databaseJobId}));
  await prisma.$transaction([prisma.job.update({where:{id:databaseJobId},data:{status:'PROCESSING',failureReason:null}}),prisma.modelAsset.update({where:{id:assetId},data:{status:'PROCESSING'}})]);
  try{
    const sourceBytes=await downloadObject(sourceObjectKey);
    const sourceReport=await validateGlb(sourceBytes,originalFilename);
    const{normalized,analysis,statsBefore,statsAfter}=await normalizeAndAnalyze(sourceBytes);
    const normalizedReport=await validateGlb(normalized,'normalized.glb');
    const normalizedObjectKey=`assets/${assetId}/normalized/model.glb`;
    await uploadObject(normalizedObjectKey,normalized);
    const result:Prisma.InputJsonObject={normalizedObjectKey,analysis:analysis as unknown as Prisma.InputJsonValue,sourceValidation:{errors:sourceReport.issues.numErrors,warnings:sourceReport.issues.numWarnings,infos:sourceReport.issues.numInfos,hints:sourceReport.issues.numHints},normalizedValidation:{errors:normalizedReport.issues.numErrors,warnings:normalizedReport.issues.numWarnings,infos:normalizedReport.issues.numInfos,hints:normalizedReport.issues.numHints},statsBefore,statsAfter};
    await prisma.$transaction([prisma.modelAsset.update({where:{id:assetId},data:{status:'READY',normalizedObjectKey,normalizedGlbUrl:`supabase://${bucket}/${normalizedObjectKey}`,validationJson:sourceReport as unknown as Prisma.InputJsonValue,analysisJson:analysis as unknown as Prisma.InputJsonValue,analysisVersion:1}}),prisma.job.update({where:{id:databaseJobId},data:{status:'COMPLETED',result,failureReason:null}})]);
    console.info(JSON.stringify({event:'asset_analysis_completed',assetId,jobId:databaseJobId,durationMs:Date.now()-startedAt,triangles:analysis.stats.triangles,warnings:analysis.warnings.length}));
    return result;
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    const maxAttempts=job.opts.attempts??1;
    const willRetry=job.attemptsMade+1<maxAttempts;
    console.error(JSON.stringify({event:'asset_analysis_failed',assetId,jobId:databaseJobId,durationMs:Date.now()-startedAt,willRetry,error:message}));
    await prisma.$transaction([prisma.job.update({where:{id:databaseJobId},data:{status:willRetry?'RETRYING':'FAILED',failureReason:message}}),prisma.modelAsset.update({where:{id:assetId},data:{status:willRetry?'QUEUED':'FAILED'}})]);
    throw error;
  }
}

const worker=new Worker<AssetProcessingJobData>(QUEUE_NAME,processAsset,{connection:redisConnection(),concurrency:Number(process.env.ASSET_WORKER_CONCURRENCY??2)});
worker.on('completed',job=>console.info(`[asset-worker] completed ${job.id}`));
worker.on('failed',(job,error)=>console.error(`[asset-worker] failed ${job?.id??'unknown'}: ${error.message}`));
async function shutdown(signal:string){console.info(`[asset-worker] ${signal}: shutting down`);await worker.close();await prisma.$disconnect();process.exit(0);}
process.on('SIGTERM',()=>void shutdown('SIGTERM'));
process.on('SIGINT',()=>void shutdown('SIGINT'));
console.info(`[asset-worker] listening on queue ${QUEUE_NAME}`);
