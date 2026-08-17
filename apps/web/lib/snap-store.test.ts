import {beforeEach,describe,expect,it} from 'vitest';
import {useSnapInteractionStore} from './snap-store';

describe('component label display mode',()=>{
  beforeEach(()=>useSnapInteractionStore.setState({labelMode:'selected',lastVisibleLabelMode:'selected',snapEnabled:true,candidate:undefined}));

  it('turns selected labels off and restores the last visible mode',()=>{
    useSnapInteractionStore.getState().toggleLabels();
    expect(useSnapInteractionStore.getState().labelMode).toBe('off');
    useSnapInteractionStore.getState().toggleLabels();
    expect(useSnapInteractionStore.getState().labelMode).toBe('selected');
  });

  it('restores all-label mode after a temporary hide',()=>{
    useSnapInteractionStore.getState().setLabelMode('all');
    useSnapInteractionStore.getState().toggleLabels();
    expect(useSnapInteractionStore.getState().labelMode).toBe('off');
    useSnapInteractionStore.getState().toggleLabels();
    expect(useSnapInteractionStore.getState().labelMode).toBe('all');
  });
});
