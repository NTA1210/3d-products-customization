import {Document,Material,Mesh,Node,NodeIO,Primitive} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {mergeDocuments} from '@gltf-transform/functions';
import {Prisma,PrismaClient} from '@prisma/client';
import type {ModelConfiguration,ModelManifest} from '@product3d/model-schema';
import {createClient} from '@supabase/supabase-js';
import {Job as BullJob,Worker} from 'bullmq';
import * as draco3d from 'draco3dgltf';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';
import validator from 'gltf-validator';

const QUEUE='export-processing';
const db=new PrismaClient();
type Data={databaseJobId:string;projectId:string;assetId:string;sourceObjectKey:string;manifest:ModelManifest;configuration:ModelConfiguration;filename:string};
type VariantRecord={id:string;name:string;assetUrl:string;metadataJson:Prisma.JsonValue};
type VariantMetadata={dimensionPolicy?:'KEEP'|'AUTO_FIT'|'RULE_BASED';sourceDimensionsMm?:{width:number;height:number;depth:number}};

function env(name:string,fallback?:string){const value=process.env[name]??fallback;if(!value)throw new Error(`Missing ${name}`);return value;}
const bucket=env('SUPABASE_STORAGE_BUCKET','product3d');
const storage=createClient(env('SUPABASE_URL'),env('SUPABASE_SECRET_KEY'),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
function redis(){const url=new URL(process.env.REDIS_URL??'redis://localhost:6379');return{host:url.hostname,port:Number(url.port||6379),username:url.username||undefined,password:url.password||undefined,db:url.pathname.length>1?Number(url.pathname.slice(1)):0,tls:url.protocol==='rediss:'?{}:undefined,maxRetriesPerRequest:null};}
async function io(){await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);const[decoder,encoder]=await Promise.all([draco3d.createDecoderModule(),draco3d.createEncoderModule()]);return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':decoder,'draco3d.encoder':encoder,'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});}
function parseComponentId(id:string){const match=/^cmp_node_(\d+)_mesh_(\d+)_prim_(\d+)$/.exec(id);if(!match)throw new Error(`EXPORT_UNSTABLE_COMPONENT_ID: ${id}`);return{node:Number(match[1]),mesh:Number(match[2]),primitive:Number(match[3])};}
function eulerToQuat([x,y,z]:[number,number,number]):[number,number,number,number]{const c1=Math.cos(x/2),c2=Math.cos(y/2),c3=Math.cos(z/2),s1=Math.sin(x/2),s2=Math.sin(y/2),s3=Math.sin(z/2);return[s1*c2*c3+c1*s2*s3,c1*s2*c3-s1*c2*s3,c1*c2*s3+s1*s2*c3,c1*c2*c3-s1*s2*s3];}
function quatToEuler([x,y,z,w]:number[]):[number,number,number]{const t0=2*(w*x+y*z),t1=1-2*(x*x+y*y),roll=Math.atan2(t0,t1),t2=Math.max(-1,Math.min(1,2*(w*y-z*x))),pitch=Math.asin(t2),t3=2*(w*z+x*y),t4=1-2*(y*y+z*z),yaw=Math.atan2(t3,t4);return[roll,pitch,yaw];}
function hex(value:string):[number,number,number,number]{const normalized=value.replace('#','');if(!/^[0-9a-fA-F]{6}$/.test(normalized))throw new Error(`Invalid color ${value}`);return[parseInt(normalized.slice(0,2),16)/255,parseInt(normalized.slice(2,4),16)/255,parseInt(normalized.slice(4,6),16)/255,1];}
function clonePrimitive(doc:Document,source:Primitive){return doc.createPrimitive().copy(source);}
function isolatedMesh(doc:Document,nodeIndex:number){const node=doc.getRoot().listNodes()[nodeIndex];if(!node)throw new Error(`Source node ${nodeIndex} missing`);const original=node.getMesh();if(!original)throw new Error(`Source node ${nodeIndex} has no mesh`);const mesh=doc.createMesh(`${original.getName()} Export`).copy(original);mesh.listPrimitives().forEach(p=>p.dispose());original.listPrimitives().forEach(p=>mesh.addPrimitive(clonePrimitive(doc,p)));node.setMesh(mesh);return mesh;}
function materialFor(doc:Document,primitive:Primitive,name:string){const original=primitive.getMaterial();const material=doc.createMaterial(name);if(original)material.copy(original);return material;}
function applyMaterial(material:Material,preset:Awaited<ReturnType<typeof db.materialPreset.findMany>>[number]|undefined,color?:string){if(preset){const properties=preset.propertiesJson as Record<string,unknown>;if(typeof properties.baseColor==='string')material.setBaseColorFactor(hex(properties.baseColor));if(typeof properties.roughness==='number')material.setRoughnessFactor(properties.roughness);if(typeof properties.metalness==='number')material.setMetallicFactor(properties.metalness);}if(color)material.setBaseColorFactor(hex(color));}
function applyNodeMaterials(doc:Document,root:Node,preset:Awaited<ReturnType<typeof db.materialPreset.findMany>>[number]|undefined,color?:string){const visit=(node:Node)=>{const mesh=node.getMesh();if(mesh)for(const primitive of mesh.listPrimitives()){if(!preset&&!color)continue;const material=materialFor(doc,primitive,`${node.getName()||'Variant'} Customized`);applyMaterial(material,preset,color);primitive.setMaterial(material);}for(const child of node.listChildren())visit(child);};visit(root);}
function variantObjectKey(uri:string){const match=/^supabase:\/\/([^/]+)\/(.+)$/.exec(uri);if(!match)throw new Error(`VARIANT_ASSET_URL_UNSUPPORTED: ${uri}`);if(match[1]!==bucket)throw new Error(`VARIANT_BUCKET_MISMATCH: ${match[1]}`);return match[2];}
function variantScale(metadata:VariantMetadata,state:ModelConfiguration['components'][string]):[number,number,number]{const policy=metadata.dimensionPolicy??'AUTO_FIT';if(policy==='KEEP')return[...state.transform.scale];const source=metadata.sourceDimensionsMm;if(!source||source.width<=0||source.height<=0||source.depth<=0)throw new Error('VARIANT_SOURCE_DIMENSIONS_REQUIRED');return[state.dimensionsMm.width/source.width*state.transform.scale[0],state.dimensionsMm.height/source.height*state.transform.scale[1],state.dimensionsMm.depth/source.depth*state.transform.scale[2]];}
async function loadVariantDocument(nodeIo:NodeIO,variant:VariantRecord){const objectKey=variantObjectKey(variant.assetUrl);const download=await storage.storage.from(bucket).download(objectKey);if(download.error||!download.data)throw download.error??new Error(`Variant asset ${variant.id} missing`);return nodeIo.readBinary(new Uint8Array(await download.data.arrayBuffer()));}
async function compositeVariant(doc:Document,nodeIo:NodeIO,node:Node,variant:VariantRecord,state:ModelConfiguration['components'][string],preset:Awaited<ReturnType<typeof db.materialPreset.findMany>>[number]|undefined,color?:string){
  const parent=node.getParentNode();
  const rootScenes=doc.getRoot().listScenes().filter(scene=>scene.listChildren().includes(node));
  const translation=node.getTranslation(),baseEuler=quatToEuler(node.getRotation());
  const beforeSceneCount=doc.getRoot().listScenes().length;
  const variantDoc=await loadVariantDocument(nodeIo,variant);
  mergeDocuments(doc,variantDoc);
  const mergedScenes=doc.getRoot().listScenes().slice(beforeSceneCount);
  if(!mergedScenes.length)throw new Error(`VARIANT_SCENE_MISSING: ${variant.id}`);
  const wrapper=doc.createNode(`Variant ${variant.name}`)
    .setTranslation([translation[0]+state.transform.position[0]/1000,translation[1]+state.transform.position[1]/1000,translation[2]+state.transform.position[2]/1000])
    .setRotation(eulerToQuat([baseEuler[0]+state.transform.rotation[0],baseEuler[1]+state.transform.rotation[1],baseEuler[2]+state.transform.rotation[2]]))
    .setScale(variantScale(variant.metadataJson as VariantMetadata,state));
  for(const scene of mergedScenes){for(const child of [...scene.listChildren()]){scene.removeChild(child);wrapper.addChild(child);}scene.dispose();}
  applyNodeMaterials(doc,wrapper,preset,color);
  if(parent)parent.addChild(wrapper);else(rootScenes[0]??doc.getRoot().getDefaultScene()??doc.createScene('Export Scene')).addChild(wrapper);
}
function applyPlacement(doc:Document,config:ModelConfiguration){const p=config.placement.transform;if(p.position.every(v=>v===0)&&p.rotation.every(v=>v===0)&&p.scale.every(v=>v===1))return;for(const scene of doc.getRoot().listScenes()){const wrapper=doc.createNode('Product Placement').setTranslation(p.position).setRotation(eulerToQuat(p.rotation)).setScale(p.scale);for(const child of [...scene.listChildren()]){scene.removeChild(child);wrapper.addChild(child);}scene.addChild(wrapper);}}
async function bake(doc:Document,nodeIo:NodeIO,manifest:ModelManifest,config:ModelConfiguration){
  const clonedByNode=new Map<number,Mesh>();
  const materialIds=[...new Set(Object.values(config.components).map(c=>c.materialId).filter((v):v is string=>Boolean(v)))];
  const variantIds=[...new Set(Object.values(config.components).map(c=>c.variantId).filter((v):v is string=>Boolean(v)))];
  const[presets,variants]=await Promise.all([
    materialIds.length?db.materialPreset.findMany({where:{id:{in:materialIds}}}):Promise.resolve([]),
    variantIds.length?db.componentVariant.findMany({where:{id:{in:variantIds},active:true},select:{id:true,name:true,assetUrl:true,metadataJson:true}}):Promise.resolve([]),
  ]);
  const presetMap=new Map(presets.map(p=>[p.id,p])),variantMap=new Map(variants.map(v=>[v.id,v]));
  for(const definition of manifest.components){
    const state=config.components[definition.id];if(!state)continue;
    const ids=parseComponentId(definition.id);let mesh=clonedByNode.get(ids.node);if(!mesh){mesh=isolatedMesh(doc,ids.node);clonedByNode.set(ids.node,mesh);}
    const primitive=mesh.listPrimitives()[ids.primitive];if(!primitive)throw new Error(`Source primitive ${ids.primitive} missing for ${definition.id}`);
    const node=doc.getRoot().listNodes()[ids.node];if(!node)throw new Error(`Source node ${ids.node} missing`);
    if(state.deleted||!state.visible){primitive.dispose();if(mesh.listPrimitives().length===0)node.setMesh(null);continue;}
    const preset=state.materialId?presetMap.get(state.materialId):undefined;
    if(state.variantId){const variant=variantMap.get(state.variantId);if(!variant)throw new Error(`VARIANT_NOT_FOUND: ${state.variantId}`);primitive.dispose();if(mesh.listPrimitives().length===0)node.setMesh(null);await compositeVariant(doc,nodeIo,node,variant,state,preset,state.color);continue;}
    const ratios={x:1,y:1,z:1};for(const dimension of ['width','height','depth'] as const){const axis=manifest.axisMapping[dimension],original=state.originalDimensionsMm[dimension];ratios[axis]=original===0?1:state.dimensionsMm[dimension]/original;}
    const baseScale=node.getScale();node.setScale([baseScale[0]*ratios.x*state.transform.scale[0],baseScale[1]*ratios.y*state.transform.scale[1],baseScale[2]*ratios.z*state.transform.scale[2]]);
    const basePosition=node.getTranslation();node.setTranslation([basePosition[0]+state.transform.position[0]/1000,basePosition[1]+state.transform.position[1]/1000,basePosition[2]+state.transform.position[2]/1000]);
    const baseEuler=quatToEuler(node.getRotation());node.setRotation(eulerToQuat([baseEuler[0]+state.transform.rotation[0],baseEuler[1]+state.transform.rotation[1],baseEuler[2]+state.transform.rotation[2]]));
    if(state.materialId||state.color){const material=materialFor(doc,primitive,`${definition.name} Customized`);applyMaterial(material,preset,state.color);primitive.setMaterial(material);}
  }
  applyPlacement(doc,config);
}
async function processJob(job:BullJob<Data>){const d=job.data;await db.job.update({where:{id:d.databaseJobId},data:{status:'PROCESSING',failureReason:null}});try{const download=await storage.storage.from(bucket).download(d.sourceObjectKey);if(download.error||!download.data)throw download.error??new Error('Source object missing');const source=new Uint8Array(await download.data.arrayBuffer());const nodeIo=await io();const document=await nodeIo.readBinary(source);await bake(document,nodeIo,d.manifest,d.configuration);const output=await nodeIo.writeBinary(document);const report=await validator.validateBytes(output,{uri:d.filename,format:'glb',maxIssues:5000});if(report.issues.numErrors)throw new Error(`Export validation failed with ${report.issues.numErrors} error(s)`);const objectKey=`exports/${d.projectId}/${d.databaseJobId}/${d.filename}`;const uploaded=await storage.storage.from(bucket).upload(objectKey,output,{contentType:'model/gltf-binary',upsert:false});if(uploaded.error)throw uploaded.error;const result:Prisma.InputJsonObject={objectKey,filename:d.filename,sizeBytes:output.byteLength,validation:{errors:report.issues.numErrors,warnings:report.issues.numWarnings}};await db.job.update({where:{id:d.databaseJobId},data:{status:'COMPLETED',result}});return result;}catch(error){const message=error instanceof Error?error.message:String(error),retry=job.attemptsMade+1<(job.opts.attempts??1);await db.job.update({where:{id:d.databaseJobId},data:{status:retry?'RETRYING':'FAILED',failureReason:message}});throw error;}}
const worker=new Worker<Data>(QUEUE,processJob,{connection:redis(),concurrency:Number(process.env.EXPORT_WORKER_CONCURRENCY??2)});
worker.on('completed',j=>console.info(`[export-worker] completed ${j.id}`));worker.on('failed',(j,e)=>console.error(`[export-worker] failed ${j?.id??'unknown'}: ${e.message}`));
async function shutdown(){await worker.close();await db.$disconnect();process.exit(0);}process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
console.info(`[export-worker] listening on ${QUEUE}`);
