import {PrismaClient} from '@prisma/client';
const db=new PrismaClient();
async function main(){
  await db.materialPreset.upsert({where:{id:'mat_oak_light'},update:{},create:{id:'mat_oak_light',name:'Light Oak',category:'WOOD',propertiesJson:{baseColor:'#c69c6d',roughness:.65,metalness:0,allowColorTint:true},styleTags:['scandinavian','light']}});
  await db.materialPreset.upsert({where:{id:'mat_walnut'},update:{},create:{id:'mat_walnut',name:'Walnut',category:'WOOD',propertiesJson:{baseColor:'#6b4430',roughness:.58,metalness:0,allowColorTint:true},styleTags:['classic','warm']}});
  await db.materialPreset.upsert({where:{id:'mat_matte_black'},update:{},create:{id:'mat_matte_black',name:'Matte Black Metal',category:'METAL',propertiesJson:{baseColor:'#262626',roughness:.72,metalness:.72,allowColorTint:true},styleTags:['industrial']}});
}
main().finally(()=>db.$disconnect());
