import type { MaterialPreset } from '@product3d/model-schema';

export const demoMaterials:MaterialPreset[]=[
  {id:'mat_oak_light',name:'Light Oak',category:'WOOD',baseColor:'#c69c6d',roughness:.65,metalness:0,styleTags:['scandinavian','light'],allowColorTint:true},
  {id:'mat_walnut',name:'Walnut',category:'WOOD',baseColor:'#6b4430',roughness:.58,metalness:0,styleTags:['classic','warm'],allowColorTint:true},
  {id:'mat_matte_black',name:'Matte Black Metal',category:'METAL',baseColor:'#262626',roughness:.72,metalness:.72,styleTags:['industrial'],allowColorTint:true}
];
