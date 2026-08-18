import {execFile} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {Document,Material,Node,NodeIO,Primitive} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {mergeDocuments} from '@gltf-transform/functions';
import {Prisma,PrismaClient} from '@prisma/client';
import {findComponentPlacementAnchor,resolveVariantAnchorTransform} from '@product3d/compatibility-engine';
import type {AnchorDefinition,ModelConfiguration,ModelManifest} from '@product3d/model-schema';
import {createClient} from '@supabase/supabase-js';
import {Job as BullJob,Worker} from 'bullmq';
import * as draco3d from 'draco3dgltf';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';
import validator from 'gltf-validator';
import {
  applyTargetTransform,
  eulerToQuat,
  prepareComponentTargets,
} from './component-targets.js';

const QUEUE='export-processing';
const db=new PrismaClient();
const execFileAsync=promisify(execFile);
const workerDir=dirname(fileURLToPath(import.meta.url));
type ExportFormat='GLB'|'OBJ'|'STL';
type Data={databaseJobId:string;projectId:string;assetId:string;sourceObjectKey:string;manifest:ModelManifest;configuration:ModelConfiguration;filename:string;format:ExportFormat};
type VariantRecord={id:string;name:string;assetUrl:string;metadataJson:Prisma.JsonValue};
type VariantMetadata={anchorType?:string;dimensionPolicy?:'KEEP'|'AUTO_FIT'|'RULE_BASED';sourceDimensionsMm?:{width:number;height:number;depth:number}};

type Vec3=[number,number,number];
type Quat=[number,number,number,number];
function env(name:string,fallback?:string){const value=process.env[name]??fallback;if(!value)throw new Error(`Missing ${name}`);return value;}
const bucket=env('SUPABASE_STORAGE_BUCKET','product3d');
const storage=createClient(env('SUPABASE_URL'),env('SUPABASE_SECRET_KEY'),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
function redis(){const url=new URL(process.env.REDIS_URL??'redis://localhost:6379');return{host:url.hostname,port:Number(url.port||6379),username:url.username||undefined,password:url.password||undefined,db:url.pathname.length>1?Number(url.pathname.slice(1)):0,tls:url.protocol==='rediss:'?{}:undefined,maxRetriesPerRequest:null};}
async function io(){await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);const[decoder,encoder]=await Promise.all([draco3d.createDecoderModule(),draco3d.createEncoderModule()]);return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':decoder,'draco3d.encoder':encoder,'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});}

function hex(value:string):[number,number,number,number]{const normalized=value.replace('#','');if(!/^[0-9a-fA-F]{6}$/.test(normalized))throw new Error(`Invalid color ${value}`);return[parseInt(normalized.slice(0,2),16)/255,parseInt(normalized.slice(2,4),16)/255,parseInt(normalized.slice(4,6),16)/255,1];}
function materialFor(doc:Document,primitive:Primitive,name:string){const original=primitive.getMaterial();const material=doc.createMaterial(name);if(original)material.copy(original);return material;}
function applyMaterial(material:Material,preset:Awaited<ReturnType<typeof db.materialPreset.findMany>>[number]|undefined,color?:string){if(preset){const properties=preset.propertiesJson as Record<string,unknown>;if(typeof properties.baseColor==='string')material.setBaseColorFactor(hex(properties.baseColor));if(typeof properties.roughness==='number')material.setRoughnessFactor(properties.roughness);if(typeof properties.metalness==='number')material.setMetallicFactor(properties.metalness);}if(color)material.setBaseColorFactor(hex(color));}
function applyNodeMaterials(doc:Document,root:Node,preset:Awaited<ReturnType<typeof db.materialPreset.findMany>>[number]|undefined,color?:string){const visit=(node:Node)=>{const mesh=node.getMesh();if(mesh)for(const primitive of mesh.listPrimitives()){if(!preset&&!color)continue;const material=materialFor(doc,primitive,`${node.getName()||'Variant'} Customized`);applyMaterial(material,preset,color);primitive.setMaterial(material);}for(const child of node.listChildren())visit(child);};visit(root);}
function variantObjectKey(uri:string){const match=/^supabase:\/\/([^/]+)\/(.+)$/.exec(uri);if(!match)throw new Error(`VARIANT_ASSET_URL_UNSUPPORTED: ${uri}`);if(match[1]!==bucket)throw new Error(`VARIANT_BUCKET_MISMATCH: ${match[1]}`);return match[2];}
function variantScale(metadata:VariantMetadata,state:ModelConfiguration['components'][string]):[number,number,number]{const policy=metadata.dimensionPolicy??'AUTO_FIT';if(policy==='KEEP')return[...state.transform.scale];const source=metadata.sourceDimensionsMm;if(!source||source.width<=0||source.height<=0||source.depth<=0)throw new Error('VARIANT_SOURCE_DIMENSIONS_REQUIRED');return[state.dimensionsMm.width/source.width*state.transform.scale[0],state.dimensionsMm.height/source.height*state.transform.scale[1],state.dimensionsMm.depth/source.depth*state.transform.scale[2]];}
async function loadVariantDocument(nodeIo:NodeIO,variant:VariantRecord){const objectKey=variantObjectKey(variant.assetUrl);const download=await storage.storage.from(bucket).download(objectKey);if(download.error||!download.data)throw download.error??new Error(`Variant asset ${variant.id} missing`);return nodeIo.readBinary(new Uint8Array(await download.data.arrayBuffer()));}
async function compositeVariant(doc:Document,nodeIo:NodeIO,node:Node,variant:VariantRecord,state:ModelConfiguration['components'][string],preset:Awaited<ReturnType<typeof db.materialPreset.findMany>>[number]|undefined,color:string|undefined,anchor:AnchorDefinition|undefined){
  const parent=node.getParentNode();const rootScenes=doc.getRoot().listScenes().filter(scene=>scene.listChildren().includes(node));
  const placement=resolveVariantAnchorTransform({translation:[...node.getTranslation()] as Vec3,rotation:[...node.getRotation()] as Quat,scale:[...node.getScale()] as Vec3,anchor});
  const beforeSceneCount=doc.getRoot().listScenes().length;const variantDoc=await loadVariantDocument(nodeIo,variant);mergeDocuments(doc,variantDoc);const mergedScenes=doc.getRoot().listScenes().slice(beforeSceneCount);if(!mergedScenes.length)throw new Error(`VARIANT_SCENE_MISSING: ${variant.id}`);
  const wrapper=doc.createNode(`Variant ${variant.name}`).setTranslation(placement.translation).setRotation(placement.rotation).setScale(variantScale(variant.metadataJson as VariantMetadata,state));
  for(const scene of mergedScenes){for(const child of [...scene.listChildren()]){scene.removeChild(child);wrapper.addChild(child);}scene.dispose();}
  applyNodeMaterials(doc,wrapper,preset,color);if(parent)parent.addChild(wrapper);else(rootScenes[0]??doc.getRoot().getDefaultScene()??doc.createScene('Export Scene')).addChild(wrapper);node.dispose();
}

function applyPlacement(doc:Document,config:ModelConfiguration){const placement=config.placement.transform;if(placement.position.every(value=>value===0)&&placement.rotation.every(value=>value===0)&&placement.scale.every(value=>value===1))return;for(const scene of doc.getRoot().listScenes()){const wrapper=doc.createNode('Product Placement').setTranslation(placement.position).setRotation(eulerToQuat(placement.rotation)).setScale(placement.scale);for(const child of [...scene.listChildren()]){scene.removeChild(child);wrapper.addChild(child);}scene.addChild(wrapper);}}

async function bake(doc:Document,nodeIo:NodeIO,manifest:ModelManifest,config:ModelConfiguration){
  const materialIds=[...new Set(Object.values(config.components).map(component=>component.materialId).filter((value):value is string=>Boolean(value)))];
  const variantIds=[...new Set(Object.values(config.components).map(component=>component.variantId).filter((value):value is string=>Boolean(value)))];
  const[presets,variants]=await Promise.all([
    materialIds.length?db.materialPreset.findMany({where:{id:{in:materialIds}}}):Promise.resolve([]),
    variantIds.length?db.componentVariant.findMany({where:{id:{in:variantIds},active:true},select:{id:true,name:true,assetUrl:true,metadataJson:true}}):Promise.resolve([]),
  ]);
  const presetMap=new Map(presets.map(preset=>[preset.id,preset]));
  const variantMap=new Map(variants.map(variant=>[variant.id,variant]));
  const targets=prepareComponentTargets(doc,manifest);

  for(const definition of manifest.components){
    const state=config.components[definition.id];
    if(!state)continue;
    const target=targets.get(definition.id);
    if(!target)throw new Error(`EXPORT_COMPONENT_TARGET_MISSING: ${definition.id}`);
    if(state.deleted||!state.visible){target.node.dispose();continue;}
    const preset=state.materialId?presetMap.get(state.materialId):undefined;
    if(state.variantId){
      const variant=variantMap.get(state.variantId);
      if(!variant)throw new Error(`VARIANT_NOT_FOUND: ${state.variantId}`);
      const metadata=variant.metadataJson as VariantMetadata;
      const anchorType=metadata.anchorType??'BOUNDS_CENTER';
      const anchor=findComponentPlacementAnchor(definition,anchorType,manifest.anchors??[]);
      if(anchorType.trim().toUpperCase()!=='BOUNDS_CENTER'&&!anchor)throw new Error(`VARIANT_PLACEMENT_ANCHOR_MISSING: ${definition.id}:${anchorType}`);
      // Apply the component's current size/position/rotation first. The shared anchor transform
      // then maps the variant mount-origin into exactly the same local frame used by the viewer.
      applyTargetTransform(target,manifest,state);
      await compositeVariant(doc,nodeIo,target.node,variant,state,preset,state.color,anchor);
      continue;
    }
    applyTargetTransform(target,manifest,state);
    if((state.materialId||state.color)&&target.primitive){
      const material=materialFor(doc,target.primitive,`${definition.name} Customized`);
      applyMaterial(material,preset,state.color);
      target.primitive.setMaterial(material);
    }
  }
  applyPlacement(doc,config);
}

async function convertDerived(glb:Uint8Array,format:Exclude<ExportFormat,'GLB'>){const dir=await mkdtemp(join(tmpdir(),'product3d-export-'));try{const input=join(dir,'customized.glb'),output=join(dir,`customized.${format.toLowerCase()}`);await writeFile(input,glb);const script=join(workerDir,'../convert.py');await execFileAsync(process.env.PYTHON_BIN??'python3',[script,input,output,format.toLowerCase()],{timeout:Number(process.env.FORMAT_EXPORT_TIMEOUT_MS??120000),maxBuffer:1024*1024});return new Uint8Array(await readFile(output));}finally{await rm(dir,{recursive:true,force:true});}}
function contentType(format:ExportFormat){if(format==='GLB')return'model/gltf-binary';if(format==='STL')return'model/stl';return'text/plain; charset=utf-8';}
async function processJob(job:BullJob<Data>){const data=job.data;await db.job.update({where:{id:data.databaseJobId},data:{status:'PROCESSING',failureReason:null}});try{const download=await storage.storage.from(bucket).download(data.sourceObjectKey);if(download.error||!download.data)throw download.error??new Error('Source object missing');const source=new Uint8Array(await download.data.arrayBuffer());const nodeIo=await io();const document=await nodeIo.readBinary(source);await bake(document,nodeIo,data.manifest,data.configuration);const glb=await nodeIo.writeBinary(document);const report=await validator.validateBytes(glb,{uri:data.format==='GLB'?data.filename:'customized.glb',format:'glb',maxIssues:5000});if(report.issues.numErrors)throw new Error(`Export validation failed with ${report.issues.numErrors} error(s)`);const output=data.format==='GLB'?glb:await convertDerived(glb,data.format),objectKey=`exports/${data.projectId}/${data.databaseJobId}/${data.filename}`;const uploaded=await storage.storage.from(bucket).upload(objectKey,output,{contentType:contentType(data.format),upsert:false});if(uploaded.error)throw uploaded.error;const result:Prisma.InputJsonObject={objectKey,filename:data.filename,format:data.format,sizeBytes:output.byteLength,sourceGlbValidation:{errors:report.issues.numErrors,warnings:report.issues.numWarnings},unit:data.format==='GLB'?'meter':'millimeter'};await db.job.update({where:{id:data.databaseJobId},data:{status:'COMPLETED',result}});return result;}catch(error){const message=error instanceof Error?error.message:String(error),retry=job.attemptsMade+1<(job.opts.attempts??1);await db.job.update({where:{id:data.databaseJobId},data:{status:retry?'RETRYING':'FAILED',failureReason:message}});throw error;}}
const worker=new Worker<Data>(QUEUE,processJob,{connection:redis(),concurrency:Number(process.env.EXPORT_WORKER_CONCURRENCY??2)});
worker.on('completed',job=>console.info(`[export-worker] completed ${job.id}`));
worker.on('failed',(job,error)=>console.error(`[export-worker] failed ${job?.id??'unknown'}: ${error.message}`));
async function shutdown(){await worker.close();await db.$disconnect();process.exit(0);}
process.on('SIGINT',()=>void shutdown());
process.on('SIGTERM',()=>void shutdown());
console.info(`[export-worker] listening on ${QUEUE}`);
