import type { MaterialPreset } from '@product3d/model-schema';

const fallbackMaterials:MaterialPreset[]=[
  {id:'mat_oak_light',name:'Light Oak',category:'WOOD',baseColor:'#c69c6d',roughness:.65,metalness:0,styleTags:['scandinavian','light'],allowColorTint:true},
  {id:'mat_walnut',name:'Walnut',category:'WOOD',baseColor:'#6b4430',roughness:.58,metalness:0,styleTags:['classic','warm'],allowColorTint:true},
  {id:'mat_matte_black',name:'Matte Black Metal',category:'METAL',baseColor:'#262626',roughness:.72,metalness:.72,styleTags:['industrial'],allowColorTint:true},
];

/**
 * Shared mutable catalog consumed by the editor validator and Three.js projection.
 * The fallback keeps offline/demo startup usable; once `/api/materials` loads, the
 * database catalog replaces it in-place so existing references see the same data.
 */
export const demoMaterials:MaterialPreset[]=[...fallbackMaterials];
export function replaceRuntimeMaterials(items:MaterialPreset[]){
  if(!items.length)return;
  demoMaterials.splice(0,demoMaterials.length,...items.map(item=>structuredClone(item)));
}
