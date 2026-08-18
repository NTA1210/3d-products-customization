import {describe,expect,it} from 'vitest';
import type {AppearanceRule,ComponentManifest,ModelManifest} from '@product3d/model-schema';
import {
  appearanceRuleMembers,
  appearanceRuleTargets,
  componentMatchesAppearanceRule,
  expandManualAppearanceRuleAction,
  matchingAppearanceRules,
  normalizeComponentAttributes,
} from '../apps/web/lib/appearance-rules';

function component(id:string,attributes:Record<string,string>,labels?:string[]):ComponentManifest{
  return{
    id,name:id,role:'OTHER',attributes,labels,styleTags:[],sourceNodeIds:[],sourceMeshIds:[],editable:true,
    editableAxes:{x:true,y:true,z:true},scalingMode:'AXIS_SCALE',
    constraints:{width:null,height:null,depth:null},anchorIds:[],materialSlotIds:[],
  };
}
function rule(id:string,match:Record<string,string>,syncChannels:AppearanceRule['syncChannels']=['MATERIAL','COLOR']):AppearanceRule{
  return{id,name:id,match,syncChannels,enabled:true};
}
function manifest(components:ComponentManifest[],appearanceRules:AppearanceRule[]=[]):ModelManifest{
  return{modelId:'model',version:1,unit:'mm',axisMapping:{width:'x',height:'y',depth:'z'},components,dependencies:[],appearanceRules,anchors:[]};
}

describe('component attribute appearance rules',()=>{
  it('normalizes attribute keys and values case-insensitively',()=>{
    expect(normalizeComponentAttributes({' Part ':' Wing ','SIDE':' LEFT ',empty:''})).toEqual({part:'wing',side:'left'});
  });

  it('matches a subset of attributes so left/right wing can share appearance',()=>{
    const left=component('left',{part:'wing',side:'left',section:'primary'});
    const right=component('right',{part:'WING',side:'RIGHT',section:'primary'});
    const stabilizer=component('stabilizer',{part:'stabilizer',side:'left'});
    const wingRule=rule('wing-surface',{part:'wing'});
    const value=manifest([left,right,stabilizer],[wingRule]);

    expect(componentMatchesAppearanceRule(left,wingRule)).toBe(true);
    expect(componentMatchesAppearanceRule(right,wingRule)).toBe(true);
    expect(componentMatchesAppearanceRule(stabilizer,wingRule)).toBe(false);
    expect(appearanceRuleMembers(value,wingRule).map(item=>item.id)).toEqual(['left','right']);
  });

  it('supports more specific rules without breaking the broader wing rule',()=>{
    const left=component('left',{part:'wing',side:'left'});
    const right=component('right',{part:'wing',side:'right'});
    const broad=rule('wing',{part:'wing'});
    const leftOnly=rule('left-marking',{part:'wing',side:'left'},['COLOR']);
    const value=manifest([left,right],[broad,leftOnly]);

    expect(matchingAppearanceRules(value,'left').map(item=>item.id)).toEqual(['wing','left-marking']);
    expect(matchingAppearanceRules(value,'right').map(item=>item.id)).toEqual(['wing']);
    expect(appearanceRuleMembers(value,leftOnly).map(item=>item.id)).toEqual(['left']);
  });

  it('unions only rules matched by the source, respects channels, and never chains through target-only rules',()=>{
    const left=component('left',{part:'wing',side:'left',surface:'exterior'});
    const right=component('right',{part:'wing',side:'right',surface:'exterior'});
    const stabilizer=component('stabilizer',{part:'stabilizer',surface:'exterior'});
    const rightDetail=component('right-detail',{part:'inspection-panel',side:'right',surface:'interior'});
    const cabin=component('cabin',{part:'cabin',surface:'interior'});
    const value=manifest([left,right,stabilizer,rightDetail,cabin],[
      rule('wing-surface',{part:'wing'},['MATERIAL','COLOR']),
      rule('aircraft-paint',{surface:'exterior'},['COLOR']),
      rule('right-only',{side:'right'},['COLOR']),
    ]);

    expect(appearanceRuleTargets(value,'left','MATERIAL').map(item=>item.id)).toEqual(['left','right']);
    expect(appearanceRuleTargets(value,'left','COLOR').map(item=>item.id)).toEqual(['left','right','stabilizer']);
    expect(appearanceRuleTargets(value,'left','COLOR').map(item=>item.id)).not.toContain('right-detail');
    expect(appearanceRuleTargets(value,'left','COLOR').map(item=>item.id)).not.toContain('cabin');
  });

  it('treats empty match as safe/no-op and ignores legacy labels for synchronization',()=>{
    const left=component('left',{},['wing']);
    const right=component('right',{},['wing']);
    const emptyRule=rule('empty',{});
    const value=manifest([left,right],[emptyRule]);
    expect(appearanceRuleMembers(value,emptyRule)).toEqual([]);
    expect(appearanceRuleTargets(value,'left','COLOR').map(item=>item.id)).toEqual(['left']);
  });

  it('expands only manual material/color actions; geometry and transform remain independent',()=>{
    const value=manifest([
      component('left',{part:'wing',side:'left'}),
      component('right',{part:'wing',side:'right'}),
    ],[rule('wing',{part:'wing'})]);

    const color=expandManualAppearanceRuleAction({type:'SET_COLOR',componentId:'left',color:'#112233',source:'MANUAL'},value);
    expect(color.map(action=>action.componentId)).toEqual(['left','right']);

    const material=expandManualAppearanceRuleAction({type:'SET_MATERIAL',componentId:'right',materialId:'paint',source:'MANUAL'},value);
    expect(material.map(action=>action.componentId)).toEqual(['left','right']);

    const move=expandManualAppearanceRuleAction({type:'SET_POSITION',componentId:'left',axis:'X',value:100,source:'MANUAL'},value);
    expect(move).toHaveLength(1);
    const resize=expandManualAppearanceRuleAction({type:'SET_DIMENSION',componentId:'left',axis:'WIDTH',valueMm:200,source:'MANUAL'},value);
    expect(resize).toHaveLength(1);
    const variant=expandManualAppearanceRuleAction({type:'REPLACE_COMPONENT',componentId:'left',variantId:'wing-v2',source:'MANUAL'},value);
    expect(variant).toHaveLength(1);
  });

  it('does not expand non-manual actions implicitly',()=>{
    const value=manifest([
      component('left',{part:'wing'}),component('right',{part:'wing'}),
    ],[rule('wing',{part:'wing'})]);
    const ai=expandManualAppearanceRuleAction({type:'SET_COLOR',componentId:'left',color:'#abcdef',source:'AI'},value);
    expect(ai).toHaveLength(1);
  });
});
