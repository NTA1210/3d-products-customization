import {describe,expect,it} from 'vitest';
import {HistoryEngine,type EditorCommand} from '../packages/action-engine/src/index';
import {applyAction} from '../packages/editor-core/src/index';
import {ModelConfigurationSchema,type MaterialPreset,type ModelConfiguration,type ModelManifest} from '../packages/model-schema/src/index';

const manifest:ModelManifest={modelId:'critical-flow-model',version:1,unit:'mm',axisMapping:{width:'x',height:'y',depth:'z'},components:[{id:'top',sourceNodeIds:['node_0000'],sourceMeshIds:['mesh_0000'],name:'Top',role:'TOP',editable:true,editableAxes:{x:true,y:false,z:true},scalingMode:'AXIS_SCALE',constraints:{width:{min:600,max:1800},height:null,depth:{min:400,max:1000}},anchorIds:[],allowedMaterialCategories:['WOOD'],materialSlotIds:[]}],dependencies:[]};
const oak:MaterialPreset={id:'oak',name:'Oak',category:'WOOD',roughness:.6,metalness:0,styleTags:['natural'],allowColorTint:true};
const original:ModelConfiguration={modelId:manifest.modelId,manifestVersion:1,placement:{locked:false,transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}},components:{top:{originalDimensionsMm:{width:1000,height:40,depth:600},dimensionsMm:{width:1000,height:40,depth:600},transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},visible:true,deleted:false}}};

describe('critical Phase 1 configuration flow',()=>{
  it('rejects customization before lock, then preserves exact state through history and serialization',()=>{
    const blocked=applyAction({type:'SET_DIMENSION',componentId:'top',axis:'WIDTH',valueMm:1200,source:'MANUAL'},manifest,original,{materials:[oak]});
    expect(blocked.ok).toBe(false);

    let current:ModelConfiguration={...structuredClone(original),placement:{...original.placement,locked:true}};
    const history=new HistoryEngine();
    for(const action of [
      {type:'SET_DIMENSION',componentId:'top',axis:'WIDTH',valueMm:1200,source:'MANUAL'} as const,
      {type:'SET_MATERIAL',componentId:'top',materialId:'oak',source:'MANUAL'} as const,
      {type:'SET_COLOR',componentId:'top',color:'#AABBCC',source:'MANUAL'} as const,
    ]){
      const before=structuredClone(current),result=applyAction(action,manifest,current,{materials:[oak]});
      expect(result.ok).toBe(true);if(!result.ok)throw new Error(result.message);
      const command:EditorCommand={id:`cmd-${action.type}`,actions:[action],before,after:result.configuration};history.push(command);current=result.configuration;
    }

    expect(current.components.top.dimensionsMm.width).toBe(1200);
    expect(current.components.top.materialId).toBe('oak');
    expect(current.components.top.color).toBe('#AABBCC');

    const afterUndo=history.undo(current);expect(afterUndo.components.top.color).toBeUndefined();
    const afterRedo=history.redo(afterUndo);expect(afterRedo).toEqual(current);

    const persisted=JSON.stringify(afterRedo),reloaded=ModelConfigurationSchema.parse(JSON.parse(persisted));
    expect(reloaded).toEqual(afterRedo);
    expect(reloaded.placement.locked).toBe(true);
  });
});
