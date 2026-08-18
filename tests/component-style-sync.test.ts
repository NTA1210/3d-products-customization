import {describe,expect,it} from 'vitest';
import type {ComponentManifest,ModelManifest} from '@product3d/model-schema';
import {componentLabelKey,exactLabelStyleGroup,expandManualStyleSyncAction,normalizeComponentLabels} from '../apps/web/lib/component-style-sync';

function component(id:string,labels:string[]):ComponentManifest{
  return{
    id,name:id,role:'OTHER',labels,styleTags:[],sourceNodeIds:[],sourceMeshIds:[],editable:true,
    editableAxes:{x:true,y:true,z:true},scalingMode:'AXIS_SCALE',
    constraints:{width:null,height:null,depth:null},anchorIds:[],materialSlotIds:[],
  };
}
function manifest(...components:ComponentManifest[]):ModelManifest{
  return{modelId:'model',version:1,unit:'mm',axisMapping:{width:'x',height:'y',depth:'z'},components,dependencies:[],anchors:[]};
}

describe('exact component label style sync',()=>{
  it('normalizes labels as a case-insensitive exact set',()=>{
    expect(normalizeComponentLabels([' Wing ','PRIMARY','wing'])).toEqual(['primary','wing']);
    expect(componentLabelKey(['wing','primary'])).toBe(componentLabelKey(['PRIMARY','Wing']));
  });

  it('links only components whose entire non-empty label set matches',()=>{
    const value=manifest(
      component('left',['wing','primary']),
      component('right',['PRIMARY','WING']),
      component('tip',['wing']),
      component('empty-a',[]),
      component('empty-b',[]),
    );
    expect(exactLabelStyleGroup(value,'left').map(item=>item.id)).toEqual(['left','right']);
    expect(exactLabelStyleGroup(value,'tip').map(item=>item.id)).toEqual(['tip']);
    expect(exactLabelStyleGroup(value,'empty-a').map(item=>item.id)).toEqual(['empty-a']);
  });

  it('expands manual material/color edits but keeps geometry edits independent',()=>{
    const value=manifest(component('left',['wing']),component('right',['WING']),component('body',['body']));
    const color=expandManualStyleSyncAction({type:'SET_COLOR',componentId:'left',color:'#112233',source:'MANUAL'},value);
    expect(color.map(action=>action.componentId)).toEqual(['left','right']);
    expect(color.every(action=>action.type==='SET_COLOR'&&action.color==='#112233')).toBe(true);

    const material=expandManualStyleSyncAction({type:'SET_MATERIAL',componentId:'right',materialId:'paint',source:'MANUAL'},value);
    expect(material.map(action=>action.componentId)).toEqual(['left','right']);

    const variant=expandManualStyleSyncAction({type:'REPLACE_COMPONENT',componentId:'left',variantId:'wing-v2',source:'MANUAL'},value);
    expect(variant).toHaveLength(1);
    expect(variant[0].componentId).toBe('left');

    const move=expandManualStyleSyncAction({type:'SET_POSITION',componentId:'left',axis:'X',value:100,source:'MANUAL'},value);
    expect(move).toHaveLength(1);
    expect(move[0].componentId).toBe('left');
  });

  it('does not expand AI/preset/style actions implicitly',()=>{
    const value=manifest(component('left',['wing']),component('right',['wing']));
    const ai=expandManualStyleSyncAction({type:'SET_COLOR',componentId:'left',color:'#abcdef',source:'AI'},value);
    expect(ai).toHaveLength(1);
  });
});
