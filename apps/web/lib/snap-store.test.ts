import {beforeEach,describe,expect,it} from 'vitest';
import {useSnapInteractionStore} from './snap-store';

function resetInteraction(){
  useSnapInteractionStore.setState({
    snapEnabled:false,
    persistentSnapEnabled:false,
    temporarySnapActive:false,
    attachMode:false,
    candidate:undefined,
    groundBarrier:undefined,
    labelMode:'selected',
    lastVisibleLabelMode:'selected',
  });
}

describe('designer snap interaction intent',()=>{
  beforeEach(resetInteraction);

  it('starts in free-move mode',()=>{
    const state=useSnapInteractionStore.getState();
    expect(state.snapEnabled).toBe(false);
    expect(state.persistentSnapEnabled).toBe(false);
    expect(state.attachMode).toBe(false);
  });

  it('arms positioning snap only while the temporary modifier is held',()=>{
    useSnapInteractionStore.getState().setTemporarySnap(true);
    expect(useSnapInteractionStore.getState().snapEnabled).toBe(true);
    expect(useSnapInteractionStore.getState().attachMode).toBe(false);

    useSnapInteractionStore.getState().setTemporarySnap(false);
    expect(useSnapInteractionStore.getState().snapEnabled).toBe(false);
  });

  it('keeps persistent position snap separate from attach mode',()=>{
    useSnapInteractionStore.getState().toggleSnap();
    let state=useSnapInteractionStore.getState();
    expect(state.persistentSnapEnabled).toBe(true);
    expect(state.snapEnabled).toBe(true);
    expect(state.attachMode).toBe(false);

    state.toggleAttachMode();
    state=useSnapInteractionStore.getState();
    expect(state.attachMode).toBe(true);
    expect(state.snapEnabled).toBe(true);

    state.setAttachMode(false);
    state=useSnapInteractionStore.getState();
    expect(state.attachMode).toBe(false);
    expect(state.snapEnabled).toBe(true);
  });

  it('attach mode itself arms snap even when persistent snap is off',()=>{
    useSnapInteractionStore.getState().setAttachMode(true);
    expect(useSnapInteractionStore.getState().snapEnabled).toBe(true);
    useSnapInteractionStore.getState().setAttachMode(false);
    expect(useSnapInteractionStore.getState().snapEnabled).toBe(false);
  });
});

describe('component label display mode',()=>{
  beforeEach(resetInteraction);

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
