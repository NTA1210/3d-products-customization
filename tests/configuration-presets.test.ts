import {describe,expect,it} from 'vitest';
import type {ModelConfiguration,ModelManifest} from '../packages/model-schema/src/index';
import {presetRulesFromConfiguration,resetProductConfiguration} from '../apps/web/lib/configuration-presets';

const manifest:ModelManifest={
  modelId:'m1',version:1,unit:'mm',axisMapping:{width:'x',height:'y',depth:'z'},dependencies:[],
  components:[
    {id:'top',sourceNodeIds:[],sourceMeshIds:[],name:'Top',role:'TOP',editable:true,editableAxes:{x:true,y:false,z:true},scalingMode:'AXIS_SCALE',constraints:{width:null,height:null,depth:null},anchorIds:[],materialSlotIds:[]},
    {id:'frame',sourceNodeIds:[],sourceMeshIds:[],name:'Frame',role:'FRAME',editable:false,editableAxes:{x:false,y:false,z:false},scalingMode:'FIXED',constraints:{width:null,height:null,depth:null},anchorIds:[],materialSlotIds:[]},
  ],
};

const configuration:ModelConfiguration={
  modelId:'m1',manifestVersion:1,
  placement:{locked:true,transform:{position:[4,5,6],rotation:[0,.2,0],scale:[1,1,1]}},
  components:{
    top:{originalDimensionsMm:{width:1000,height:40,depth:600},dimensionsMm:{width:1200,height:40,depth:650},transform:{position:[25,0,0],rotation:[0,.3,0],scale:[1,1,1]},materialId:'mat_oak_light',color:'#aabbcc',variantId:'wide',visible:true,deleted:false},
    frame:{originalDimensionsMm:{width:900,height:700,depth:500},dimensionsMm:{width:900,height:700,depth:500},transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},visible:true,deleted:false},
  },
  attachments:[{id:'a1',sourceComponentId:'top',sourceAnchorId:'s',targetComponentId:'frame',targetAnchorId:'t',createdBy:'MANUAL'}],
  appliedStyleId:'style1',appliedPresetId:'preset1',
};

describe('product reset',()=>{
  it('resets customization but preserves approved placement',()=>{
    const result=resetProductConfiguration(configuration);
    expect(result.placement).toEqual(configuration.placement);
    expect(result.components.top.dimensionsMm).toEqual(configuration.components.top.originalDimensionsMm);
    expect(result.components.top.transform).toEqual({position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});
    expect(result.components.top.materialId).toBeUndefined();
    expect(result.components.top.color).toBeUndefined();
    expect(result.components.top.variantId).toBeUndefined();
    expect(result.attachments).toEqual([]);
    expect(result.appliedStyleId).toBeUndefined();
    expect(result.appliedPresetId).toBeUndefined();
    expect(configuration.components.top.dimensionsMm.width).toBe(1200);
  });
});

describe('preset snapshot',()=>{
  it('captures only meaningful editable customization in manifest-supported dimensions',()=>{
    const rules=presetRulesFromConfiguration(manifest,configuration);
    expect(rules).toEqual(expect.arrayContaining([
      {type:'REPLACE_COMPONENT',target:{componentId:'top'},variantId:'wide'},
      {type:'SET_MATERIAL',target:{componentId:'top'},materialId:'mat_oak_light'},
      {type:'SET_COLOR',target:{componentId:'top'},color:'#aabbcc'},
      {type:'SET_DIMENSION',target:{componentId:'top'},axis:'WIDTH',valueMm:1200},
      {type:'SET_DIMENSION',target:{componentId:'top'},axis:'DEPTH',valueMm:650},
    ]));
    expect(rules.some(rule=>'target' in rule&&rule.target.componentId==='frame')).toBe(false);
    expect(rules.some(rule=>rule.type==='SET_DIMENSION'&&rule.axis==='HEIGHT')).toBe(false);
  });
});
