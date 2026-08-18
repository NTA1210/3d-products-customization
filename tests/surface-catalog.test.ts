import {describe,expect,it} from 'vitest';
import {ColorPresetSchema,MaterialPresetSchema} from '../packages/model-schema/src/index';
import {demoMaterials,replaceRuntimeMaterials} from '../apps/web/lib/materials';

describe('surface catalog schemas',()=>{
  it('validates reusable color presets with style and material metadata',()=>{
    const color=ColorPresetSchema.parse({id:'sage',name:'Sage',hex:'#A7B49A',styleTags:['natural'],compatibleMaterialCategories:['FABRIC','WOOD']});
    expect(color.hex).toBe('#A7B49A');
    expect(color.compatibleMaterialCategories).toEqual(['FABRIC','WOOD']);
    expect(()=>ColorPresetSchema.parse({id:'bad',name:'Bad',hex:'sage'})).toThrow();
  });

  it('hydrates the shared material catalog in place',()=>{
    const reference=demoMaterials,original=structuredClone(demoMaterials);
    const catalog=[MaterialPresetSchema.parse({id:'mat_custom',name:'Custom Fabric',category:'FABRIC',baseColor:'#445566',roughness:.8,metalness:0,styleTags:['soft'],allowColorTint:true})];
    try{
      replaceRuntimeMaterials(catalog);
      expect(demoMaterials).toBe(reference);
      expect(demoMaterials).toEqual(catalog);
    }finally{
      replaceRuntimeMaterials(original);
    }
  });
});
