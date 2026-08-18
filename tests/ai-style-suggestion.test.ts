import {describe,expect,it} from 'vitest';
import {validateAiDesignResponse} from '../packages/ai-engine/src/index';
import type {MaterialPreset,ModelConfiguration,ModelManifest} from '../packages/model-schema/src/index';

const manifest:ModelManifest={
  modelId:'m1',version:1,unit:'mm',axisMapping:{width:'x',height:'y',depth:'z'},dependencies:[],
  components:[{id:'top',sourceNodeIds:[],sourceMeshIds:[],name:'Top',role:'TOP',editable:true,editableAxes:{x:true,y:false,z:true},scalingMode:'AXIS_SCALE',constraints:{width:null,height:null,depth:null},anchorIds:[],materialSlotIds:[],allowedMaterialCategories:['WOOD']}],
};
const configuration:ModelConfiguration={
  modelId:'m1',manifestVersion:1,placement:{locked:true,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}},
  components:{top:{originalDimensionsMm:{width:1000,height:40,depth:600},dimensionsMm:{width:1000,height:40,depth:600},transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},visible:true,deleted:false}},
};
const material:MaterialPreset={id:'oak',name:'Oak',category:'WOOD',baseColor:'#C69C6D',roughness:.6,metalness:0,styleTags:['scandinavian'],allowColorTint:true};
const catalog={materialIds:new Set(['oak']),variantIds:new Set<string>(),styleIds:new Set(['scandi']),componentIds:new Set(['top'])};
const styles=[{id:'scandi',rulesJson:[{type:'SET_MATERIAL',target:{role:'TOP'},materialId:'oak'}]}];

describe('AI style suggestions',()=>{
  it('expands an APPLY_STYLE proposal into normal AI editor actions before validation',()=>{
    const result=validateAiDesignResponse({
      response:{summary:'Use the light style',suggestions:[{id:'s1',title:'Scandinavian',reason:'Keeps a light wood language.',actions:[{type:'APPLY_STYLE',styleId:'scandi',source:'AI'}]}]},
      manifest,configuration,catalog,materials:[material],styles,
    });
    expect(result.suggestions[0]).toMatchObject({valid:true,requestedStyleIds:['scandi']});
    expect(result.suggestions[0].actions).toEqual([{type:'SET_MATERIAL',componentId:'top',materialId:'oak',source:'AI'}]);
  });

  it('does not allow the provider to invent a style id',()=>{
    const result=validateAiDesignResponse({
      response:{summary:'Unknown',suggestions:[{id:'s1',title:'Fake',reason:'No catalog match.',actions:[{type:'APPLY_STYLE',styleId:'invented',source:'AI'}]}]},
      manifest,configuration,catalog,materials:[material],styles,
    });
    expect(result.suggestions[0].valid).toBe(false);
    expect(result.suggestions[0].validationErrors).toContain('Unknown styleId: invented');
    expect(result.suggestions[0].actions).toEqual([]);
  });
});
