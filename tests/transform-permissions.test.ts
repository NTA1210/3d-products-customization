import {describe,expect,it} from 'vitest';
import {validateAction} from '../packages/constraint-engine/src/index';
import {ModelManifestSchema,type ModelConfiguration,type ModelManifest} from '../packages/model-schema/src/index';

const configuration:ModelConfiguration={
  modelId:'m1',manifestVersion:1,
  placement:{locked:true,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}},
  components:{part:{
    originalDimensionsMm:{width:100,height:100,depth:100},
    dimensionsMm:{width:100,height:100,depth:100},
    transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},
    visible:true,deleted:false,
  }},
};

function manifest(patch:Partial<ModelManifest['components'][number]>={}):ModelManifest{
  return{
    modelId:'m1',version:1,unit:'mm',axisMapping:{width:'x',height:'y',depth:'z'},dependencies:[],
    components:[{
      id:'part',sourceNodeIds:[],sourceMeshIds:[],name:'Part',role:'OTHER',editable:true,
      editableAxes:{x:true,y:true,z:true},scalingMode:'AXIS_SCALE',constraints:{width:null,height:null,depth:null},anchorIds:[],materialSlotIds:[],
      ...patch,
    }],
  };
}

describe('component transform permissions',()=>{
  it('keeps legacy manifests backward compatible when permission fields are absent',()=>{
    const parsed=ModelManifestSchema.parse(manifest());
    expect(parsed.components[0].positionEditableAxes).toBeUndefined();
    expect(parsed.components[0].rotationEditableAxes).toBeUndefined();
    expect(validateAction({type:'SET_POSITION',componentId:'part',axis:'Y',value:25,source:'MANUAL'},parsed,configuration)).toEqual({ok:true});
    expect(validateAction({type:'SET_ROTATION',componentId:'part',axis:'Z',value:.2,source:'MANUAL'},parsed,configuration)).toEqual({ok:true});
  });

  it('rejects a locked position axis while keeping another position axis editable',()=>{
    const current=manifest({positionEditableAxes:{x:true,y:false,z:true}});
    expect(validateAction({type:'SET_POSITION',componentId:'part',axis:'Y',value:-10,source:'MANUAL'},current,configuration)).toMatchObject({ok:false,code:'POSITION_AXIS_NOT_EDITABLE'});
    expect(validateAction({type:'SET_POSITION',componentId:'part',axis:'X',value:10,source:'MANUAL'},current,configuration)).toEqual({ok:true});
  });

  it('rejects a locked rotation axis while keeping another rotation axis editable',()=>{
    const current=manifest({rotationEditableAxes:{x:false,y:true,z:false}});
    expect(validateAction({type:'SET_ROTATION',componentId:'part',axis:'X',value:.4,source:'MANUAL'},current,configuration)).toMatchObject({ok:false,code:'ROTATION_AXIS_NOT_EDITABLE'});
    expect(validateAction({type:'SET_ROTATION',componentId:'part',axis:'Y',value:.4,source:'MANUAL'},current,configuration)).toEqual({ok:true});
  });

  it('still rejects all customization when the component itself is not editable',()=>{
    const current=manifest({editable:false,positionEditableAxes:{x:true,y:true,z:true},rotationEditableAxes:{x:true,y:true,z:true}});
    expect(validateAction({type:'SET_POSITION',componentId:'part',axis:'X',value:1,source:'MANUAL'},current,configuration)).toMatchObject({ok:false,code:'COMPONENT_NOT_EDITABLE'});
  });
});
