import {describe,expect,it} from 'vitest';
import {applyAction} from '../packages/editor-core/src/index';
import type {ModelConfiguration,ModelManifest,TransformState} from '../packages/model-schema/src/index';

const component=(id:string)=>({
  id,
  sourceNodeIds:[`node_${id}`],
  sourceMeshIds:[`mesh_${id}`],
  name:id,
  role:'OTHER' as const,
  editable:true,
  editableAxes:{x:true,y:true,z:true},
  scalingMode:'AXIS_SCALE' as const,
  constraints:{width:null,height:null,depth:null},
  anchorIds:[],
  materialSlotIds:[],
});

function independentTransform(position:[number,number,number]=[0,0,0]):TransformState{
  return{position:[...position],rotation:[0,0,0],scale:[1,1,1]};
}

function baseConfig():ModelConfiguration{
  return{
    modelId:'model',
    manifestVersion:1,
    placement:{locked:true,transform:independentTransform()},
    components:{
      a:{originalDimensionsMm:{width:100,height:100,depth:100},dimensionsMm:{width:100,height:100,depth:100},transform:independentTransform(),visible:true,deleted:false},
      b:{originalDimensionsMm:{width:100,height:100,depth:100},dimensionsMm:{width:100,height:100,depth:100},transform:independentTransform(),visible:true,deleted:false},
    },
  };
}

const baseManifest:ModelManifest={
  modelId:'model',version:1,unit:'mm',axisMapping:{width:'x',height:'y',depth:'z'},
  components:[component('a'),component('b')],dependencies:[],
};

describe('component transform isolation',()=>{
  it('de-aliases legacy shared transform arrays before mutating one component',()=>{
    const config=baseConfig();
    const sharedPosition:[number,number,number]=[0,0,0];
    const sharedRotation:[number,number,number]=[0,0,0];
    const sharedScale:[number,number,number]=[1,1,1];

    config.components.a.transform={position:sharedPosition,rotation:sharedRotation,scale:sharedScale};
    config.components.b.transform={position:sharedPosition,rotation:sharedRotation,scale:sharedScale};

    const result=applyAction({type:'SET_POSITION',componentId:'a',axis:'X',value:250,source:'MANUAL'},baseManifest,config);
    expect(result.ok).toBe(true);
    if(!result.ok)return;

    expect(result.configuration.components.a.transform.position).toEqual([250,0,0]);
    expect(result.configuration.components.b.transform.position).toEqual([0,0,0]);
    expect(result.configuration.components.a.transform.position).not.toBe(result.configuration.components.b.transform.position);
    expect(result.configuration.components.a.transform.rotation).not.toBe(result.configuration.components.b.transform.rotation);
    expect(result.configuration.components.a.transform.scale).not.toBe(result.configuration.components.b.transform.scale);
    expect(config.components.a.transform.position).toEqual([0,0,0]);
    expect(config.components.b.transform.position).toEqual([0,0,0]);
  });

  it('uses the real position delta for POSITION dependency rules',()=>{
    const config=baseConfig();
    config.components.a.transform.position=[100,0,0];
    config.components.b.transform.position=[10,0,0];
    const manifest:ModelManifest={
      ...baseManifest,
      dependencies:[{
        id:'move-b-half-a',
        sourceComponentId:'a',
        triggerProperty:'POSITION',
        targetComponentId:'b',
        targetProperty:'POSITION_X',
        formula:{type:'DELTA_FACTOR',factor:.5},
      }],
    };

    const result=applyAction({type:'SET_POSITION',componentId:'a',axis:'X',value:140,source:'MANUAL'},manifest,config);
    expect(result.ok).toBe(true);
    if(!result.ok)return;

    expect(result.configuration.components.a.transform.position[0]).toBe(140);
    expect(result.configuration.components.b.transform.position[0]).toBe(30);
  });
});
