import {beforeEach,describe,expect,it} from 'vitest';
import type {ModelConfiguration,ModelManifest} from '@product3d/model-schema';
import {useEditorStore} from './store';

const manifest:ModelManifest={
  modelId:'appearance-rules',version:1,unit:'mm',axisMapping:{width:'x',height:'y',depth:'z'},dependencies:[],anchors:[],
  appearanceRules:[
    {id:'wing-surface',name:'Wing Surface',match:{part:'wing'},syncChannels:['MATERIAL','COLOR'],enabled:true},
    {id:'left-marking',name:'Left Marking',match:{part:'wing',side:'left'},syncChannels:['COLOR'],enabled:true},
  ],
  components:[
    {id:'left',attributes:{part:'wing',side:'left'},sourceNodeIds:[],sourceMeshIds:[],name:'Left Wing',role:'OTHER',editable:true,editableAxes:{x:true,y:true,z:true},scalingMode:'AXIS_SCALE',constraints:{width:null,height:null,depth:null},anchorIds:[],materialSlotIds:[],allowedMaterialCategories:['WOOD']},
    {id:'right',attributes:{part:'wing',side:'right'},sourceNodeIds:[],sourceMeshIds:[],name:'Right Wing',role:'OTHER',editable:true,editableAxes:{x:true,y:true,z:true},scalingMode:'AXIS_SCALE',constraints:{width:null,height:null,depth:null},anchorIds:[],materialSlotIds:[],allowedMaterialCategories:['WOOD']},
    {id:'body',attributes:{part:'fuselage'},sourceNodeIds:[],sourceMeshIds:[],name:'Body',role:'OTHER',editable:true,editableAxes:{x:true,y:true,z:true},scalingMode:'AXIS_SCALE',constraints:{width:null,height:null,depth:null},anchorIds:[],materialSlotIds:[]},
  ],
};
function componentState(){return{originalDimensionsMm:{width:100,height:100,depth:100},dimensionsMm:{width:100,height:100,depth:100},transform:{position:[0,0,0] as[number,number,number],rotation:[0,0,0] as[number,number,number],scale:[1,1,1] as[number,number,number]},visible:true,deleted:false};}
function configuration():ModelConfiguration{return{modelId:'appearance-rules',manifestVersion:1,placement:{locked:true,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}},components:{left:componentState(),right:componentState(),body:componentState()},attachments:[]};}

describe('appearance rule store transaction',()=>{
  beforeEach(()=>useEditorStore.setState({phase:'EDITOR',manifest:structuredClone(manifest),configuration:configuration(),selected:'left',undoStack:[],redoStack:[],error:undefined,variants:{}}));

  it('syncs left/right wing appearance through a broad part rule and undoes once',()=>{
    expect(useEditorStore.getState().dispatch({type:'SET_COLOR',componentId:'left',color:'#123456',source:'MANUAL'},'Paint wing')).toBe(true);
    const after=useEditorStore.getState();
    expect(after.configuration?.components.left.color).toBe('#123456');
    expect(after.configuration?.components.right.color).toBe('#123456');
    expect(after.configuration?.components.body.color).toBeUndefined();
    expect(after.undoStack).toHaveLength(1);

    after.undo();
    const undone=useEditorStore.getState().configuration!;
    expect(undone.components.left.color).toBeUndefined();
    expect(undone.components.right.color).toBeUndefined();
  });

  it('keeps dimensions and transforms independent',()=>{
    expect(useEditorStore.getState().dispatch({type:'SET_DIMENSION',componentId:'left',axis:'WIDTH',valueMm:150,source:'MANUAL'},'Resize left')).toBe(true);
    expect(useEditorStore.getState().dispatch({type:'SET_POSITION',componentId:'left',axis:'X',value:25,source:'MANUAL'},'Move left')).toBe(true);
    const after=useEditorStore.getState().configuration!;
    expect(after.components.left.dimensionsMm.width).toBe(150);
    expect(after.components.right.dimensionsMm.width).toBe(100);
    expect(after.components.left.transform.position[0]).toBe(25);
    expect(after.components.right.transform.position[0]).toBe(0);
  });

  it('fails atomically when one matched member rejects a material',()=>{
    const incompatible=structuredClone(manifest);
    incompatible.components.find(item=>item.id==='right')!.allowedMaterialCategories=['METAL'];
    useEditorStore.setState({manifest:incompatible,configuration:configuration(),undoStack:[],redoStack:[],error:undefined});

    expect(useEditorStore.getState().dispatch({type:'SET_MATERIAL',componentId:'left',materialId:'mat_oak_light',source:'MANUAL'},'Oak wings')).toBe(false);
    const after=useEditorStore.getState();
    expect(after.configuration?.components.left.materialId).toBeUndefined();
    expect(after.configuration?.components.right.materialId).toBeUndefined();
    expect(after.undoStack).toHaveLength(0);
    expect(after.error).toContain('Appearance rule sync failed');
  });
});
