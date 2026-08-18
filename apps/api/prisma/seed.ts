import {Prisma,PrismaClient} from '@prisma/client';
import {createClient} from '@supabase/supabase-js';
import {readFile} from 'fs/promises';
import {resolve} from 'path';
import process from 'process';

const db=new PrismaClient();

async function uploadVariant(){
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY,bucket=process.env.SUPABASE_STORAGE_BUCKET??'product3d';
  if(!url||!key){console.warn('Supabase env missing; variant catalog row will be seeded but binary upload skipped.');return;}
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const bytes=await readFile(resolve(process.cwd(),'../../examples/variants/wide-top-variant.glb'));
  const{error}=await client.storage.from(bucket).upload('catalog/variants/wide-top-variant.glb',bytes,{contentType:'model/gltf-binary',upsert:true});
  if(error)throw error;
}

async function main(){
  for(const material of[
    {id:'mat_oak_light',name:'Light Oak',category:'WOOD',propertiesJson:{baseColor:'#c69c6d',roughness:.65,metalness:0,allowColorTint:true},styleTags:['scandinavian','light']},
    {id:'mat_walnut',name:'Walnut',category:'WOOD',propertiesJson:{baseColor:'#6b4430',roughness:.58,metalness:0,allowColorTint:true},styleTags:['classic','warm']},
    {id:'mat_matte_black',name:'Matte Black Metal',category:'METAL',propertiesJson:{baseColor:'#262626',roughness:.72,metalness:.72,allowColorTint:true},styleTags:['industrial']},
  ])await db.materialPreset.upsert({where:{id:material.id},update:material,create:material});

  for(const color of[
    {id:'color_natural_oak',name:'Natural Oak',hex:'#C69C6D',styleTags:['scandinavian','light','natural'],compatibleMaterialCategories:['WOOD']},
    {id:'color_warm_walnut',name:'Warm Walnut',hex:'#6B4430',styleTags:['classic','warm'],compatibleMaterialCategories:['WOOD']},
    {id:'color_matte_black',name:'Matte Black',hex:'#262626',styleTags:['industrial','minimal'],compatibleMaterialCategories:['METAL','WOOD','PLASTIC']},
    {id:'color_warm_white',name:'Warm White',hex:'#F2EEE6',styleTags:['minimal','light'],compatibleMaterialCategories:[]},
    {id:'color_sage',name:'Sage',hex:'#A7B49A',styleTags:['natural','calm'],compatibleMaterialCategories:['FABRIC','WOOD','PLASTIC']},
  ])await db.colorPreset.upsert({where:{id:color.id},update:color,create:color});

  await uploadVariant();
  await db.componentVariant.upsert({where:{id:'variant_top_wide'},update:{},create:{id:'variant_top_wide',groupId:'tops',role:'TOP',name:'Wide Top',assetUrl:'supabase://product3d/catalog/variants/wide-top-variant.glb',compatibilityJson:{roles:['TOP']},metadataJson:{anchorType:'BOUNDS_CENTER',dimensionPolicy:'AUTO_FIT',sourceDimensionsMm:{width:1500,height:600,depth:800}},active:true}});
  await db.stylePreset.upsert({where:{id:'style_scandinavian'},update:{},create:{id:'style_scandinavian',name:'Scandinavian Light',description:'Light wood surfaces with restrained dark metal accents.',styleTags:['scandinavian','light'],rulesJson:[{type:'SET_MATERIAL',target:{role:'TOP'},materialId:'mat_oak_light'},{type:'SET_MATERIAL',target:{role:'LEG'},materialId:'mat_matte_black'}] as Prisma.InputJsonValue,active:true}});
  await db.stylePreset.upsert({where:{id:'style_warm_walnut'},update:{},create:{id:'style_warm_walnut',name:'Warm Walnut',description:'Warm walnut finish for primary surfaces.',styleTags:['classic','warm'],rulesJson:[{type:'SET_MATERIAL',target:{role:'TOP'},materialId:'mat_walnut'}] as Prisma.InputJsonValue,active:true}});

  for(const product of[
    {id:'collection_scandi_chair',name:'Scandinavian Dining Chair',category:'CHAIR',styleTags:['scandinavian','light'],materialTags:['wood','oak'],colorFamily:'natural',componentFeatures:['seat','back','leg'],thumbnailUrl:null,metadataJson:{collection:'Nordic Light'}},
    {id:'collection_scandi_bench',name:'Scandinavian Bench',category:'BENCH',styleTags:['scandinavian','light'],materialTags:['wood','oak'],colorFamily:'natural',componentFeatures:['seat','leg'],thumbnailUrl:null,metadataJson:{collection:'Nordic Light'}},
    {id:'collection_walnut_console',name:'Warm Walnut Console',category:'CONSOLE',styleTags:['classic','warm'],materialTags:['wood','walnut'],colorFamily:'brown',componentFeatures:['top','leg','storage'],thumbnailUrl:null,metadataJson:{collection:'Warm Heritage'}},
    {id:'collection_industrial_shelf',name:'Industrial Shelf',category:'SHELF',styleTags:['industrial'],materialTags:['metal','wood'],colorFamily:'black',componentFeatures:['shelf','frame'],thumbnailUrl:null,metadataJson:{collection:'Urban Metal'}},
  ])await db.collectionProduct.upsert({where:{id:product.id},update:product,create:product});

  for(const workshop of[
    {id:'workshop_demo_wood',name:'Demo Wood Workshop',contactJson:{email:'wood@example.invalid'},capabilitiesJson:{materials:['WOOD'],processes:['CNC','JOINERY'],regions:['DEMO']}},
    {id:'workshop_demo_mixed',name:'Demo Mixed Material Workshop',contactJson:{email:'mixed@example.invalid'},capabilitiesJson:{materials:['WOOD','METAL'],processes:['CNC','WELDING','FINISHING'],regions:['DEMO']}},
  ])await db.workshop.upsert({where:{id:workshop.id},update:workshop,create:workshop});
}

main().finally(()=>db.$disconnect());
