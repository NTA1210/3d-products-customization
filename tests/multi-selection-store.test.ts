import {beforeEach,describe,expect,it} from 'vitest';
import {useMultiSelectionStore} from '../apps/web/lib/multi-selection-store';

describe('multi-selection store',()=>{
  beforeEach(()=>useMultiSelectionStore.getState().clear());

  it('replaces selection for a normal click and toggles additive items',()=>{
    expect(useMultiSelectionStore.getState().setSingle('body')).toEqual(['body']);
    expect(useMultiSelectionStore.getState().toggle('wing')).toEqual(['body','wing']);
    expect(useMultiSelectionStore.getState().toggle('body')).toEqual(['wing']);
    expect(useMultiSelectionStore.getState().ids).toEqual(['wing']);
  });

  it('can clear the transient selection without touching product configuration',()=>{
    useMultiSelectionStore.getState().setSingle('engine');
    useMultiSelectionStore.getState().clear();
    expect(useMultiSelectionStore.getState().ids).toEqual([]);
  });
});
