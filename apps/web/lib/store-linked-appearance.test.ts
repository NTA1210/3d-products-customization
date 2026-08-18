import {beforeEach,describe,expect,it} from 'vitest';
import type {ModelConfiguration,ModelManifest} from '@product3d/model-schema';
import {useEditorStore} from './store';

const manifest:ModelManifest={
  modelId:'linked-style',version:1,unit:'mm',axisMapping:{width:'x',height:'y',depth:'z'},dependencies:[],anchors:[],
  components:[
    {id:'left',labels:['wing','primary'],sourceNodeIds:[],sourceMeshIds:[],name:'Left Wing',role:'OTHER',editable:true,editableAxes:{x:true,y:true,z:true},scalingMode:'AXIS_SCALE',constraints:{width:null,height:null,depth:null},anchorIds:[],materialSlotIds:[]},
    {id:'right',labels:['PRIMARY','WING'],sourceNodeIds:[],sourceMeshIds:[],name:'Right Wing',role:'OTHER',editable:true,editableAxes:{x:true,y:true,z:true},scalingMode:'AXIS_SCALE',constraints:{width:null,height:null,depth:null},anchorIds:[],materialSlotIds:[]},
    {id:'tip',labels:['wing'],sourceNodeIds:[],sourceMeshIds:[],name:'Wing Tip',role:'OTHER',editable:true,editableAxes:{x:true,y:true,z:true},scalingMode:'AXIS_SCALE',constraints:{width:null,height:null,depth:null},anchorIds:[],materialSlotIds:[]},
  ],
};
function componentState(){return{originalDimensionsMm:{width:100,height:100,depth:100},dimensionsMm:{width:100,height:100,depth:100},transform:{position:[0,0,0] as[number,number,number],rotation:[0,0,0] as[number,number,number],scale:[1,1,1] as[number,number,number]},visible:true,deleted:false};}
function configuration():ModelConfiguration{return{modelId:'linked-style',manifestVersion:1,placement:{locked:true,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}},components:{left:componentState(),right:componentState(),tip:componentState()},attachments:[]};}

describe('linked appearance store transaction',()=>{
  beforeEach(()=>useEditorStore.setState({phase:'EDITOR',manifest,configuration:configuration(),selected:'left',undoStack:[],redoStack:[],error:undefined,variants:{}}));

  it('changes exact-label peers together and undoes them together',()=>{
    expect(useEditorStore.getState().dispatch({type:'SET_COLOR',componentId:'left',color:'#123456',source:'MANUAL'},'Paint wing')).toBe(true);
    const after=useEditorStore.getState();
    expect(after.configuration?.components.left.color).toBe('#123456');
    expect(after.configuration?.components.right.color).toBe('#123456');
    expect(after.configuration?.components.tip.color).toBeUndefined();
    expect(after.undoStack).toHaveLength(1);

    after.undo();
    const undone=useEditorStore.getState().configuration!;
    expect(undone.components.left.color).toBeUndefined();
    expect(undone.components.right.color).toBeUndefined();
  });

  it('keeps dimensions independent even inside the same label group',()=>{
    expect(useEditorStore.getState().dispatch({type:'SET_DIMENSION',componentId:'left',axis:'WIDTH',valueMm:150,source:'MANUAL'},'Resize left')).toBe(true);
    const after=useEditorStore.getState().configuration!;
    expect(after.components.left.dimensionsMm.width).toBe(150);
    expect(after.components.right.dimensionsMm.width).toBe(100);
  });
});
