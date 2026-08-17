'use client';

import {useEffect,useState} from 'react';
import {useDccViewportStore,type TransformSpace} from '../lib/dcc-viewport-store';
import {shortcutDisplay} from '../lib/keyboard-shortcuts';
import {useShortcutStore} from '../lib/shortcut-store';
import {useEditorStore} from '../lib/store';
import {useSnapInteractionStore,type LabelMode} from '../lib/snap-store';

export default function WorkspaceToolbar(){
  const phase=useEditorStore(state=>state.phase);
  const selected=useEditorStore(state=>state.selected);
  const manifest=useEditorStore(state=>state.manifest);
  const configuration=useEditorStore(state=>state.configuration);
  const placementMode=useEditorStore(state=>state.placementMode);
  const componentMode=useEditorStore(state=>state.componentMode);
  const undoStack=useEditorStore(state=>state.undoStack);
  const redoStack=useEditorStore(state=>state.redoStack);
  const undo=useEditorStore(state=>state.undo);
  const redo=useEditorStore(state=>state.redo);
  const dispatch=useEditorStore(state=>state.dispatch);
  const dispatchBatch=useEditorStore(state=>state.dispatchBatch);
  const setPlacementMode=useEditorStore(state=>state.setPlacementMode);
  const setComponentMode=useEditorStore(state=>state.setComponentMode);
  const snapEnabled=useSnapInteractionStore(state=>state.snapEnabled);
  const toggleSnap=useSnapInteractionStore(state=>state.toggleSnap);
  const labelMode=useSnapInteractionStore(state=>state.labelMode);
  const setLabelMode=useSnapInteractionStore(state=>state.setLabelMode);
  const transformSpace=useDccViewportStore(state=>state.transformSpace);
  const setTransformSpace=useDccViewportStore(state=>state.setTransformSpace);
  const gridSnapEnabled=useDccViewportStore(state=>state.gridSnapEnabled);
  const toggleGridSnap=useDccViewportStore(state=>state.toggleGridSnap);
  const gridStepMm=useDccViewportStore(state=>state.gridStepMm);
  const setGridStepMm=useDccViewportStore(state=>state.setGridStepMm);
  const rotationSnapDeg=useDccViewportStore(state=>state.rotationSnapDeg);
  const setRotationSnapDeg=useDccViewportStore(state=>state.setRotationSnapDeg);
  const gizmoSize=useDccViewportStore(state=>state.gizmoSize);
  const increaseGizmo=useDccViewportStore(state=>state.increaseGizmo);
  const decreaseGizmo=useDccViewportStore(state=>state.decreaseGizmo);
  const requestFrame=useDccViewportStore(state=>state.requestFrame);
  const bindings=useShortcutStore(state=>state.bindings);
  const openSettings=useShortcutStore(state=>state.openSettings);
  const[apple,setApple]=useState(false);
  useEffect(()=>setApple(/Mac|iPhone|iPad|iPod/.test(navigator.platform)),[]);

  if(phase==='EMPTY')return null;

  const locked=Boolean(configuration?.placement.locked);
  const definition=manifest?.components.find(item=>item.id===selected);
  const selectedState=selected?configuration?.components[selected]:undefined;
  const canScale=Boolean(locked&&definition?.editable&&definition.scalingMode==='AXIS_SCALE'&&Object.values(definition.editableAxes).some(Boolean));
  const activeMode=locked?componentMode:placementMode;
  const setMode=(mode:'translate'|'rotate'|'scale')=>{
    if(!locked){if(mode!=='scale')setPlacementMode(mode);return;}
    setComponentMode(mode);
  };
  const key=(action:keyof typeof bindings)=>shortcutDisplay(bindings[action],apple);
  const hideSelected=()=>{
    if(!selected||!selectedState||selectedState.deleted||!selectedState.visible)return;
    dispatch({type:'SET_VISIBILITY',componentId:selected,visible:false,source:'MANUAL'},'Hide selected component');
  };
  const isolateSelected=()=>{
    if(!selected||!configuration||!manifest)return;
    const actions=manifest.components.flatMap(item=>{
      const state=configuration.components[item.id];if(!state||state.deleted)return[];
      const visible=item.id===selected;if(state.visible===visible)return[];
      return[{type:'SET_VISIBILITY' as const,componentId:item.id,visible,source:'MANUAL' as const}];
    });
    if(actions.length)dispatchBatch(actions,'Isolate selected component');
  };
  const showAll=()=>{
    if(!configuration||!manifest)return;
    const actions=manifest.components.flatMap(item=>{
      const state=configuration.components[item.id];if(!state||state.deleted||state.visible)return[];
      return[{type:'SET_VISIBILITY' as const,componentId:item.id,visible:true,source:'MANUAL' as const}];
    });
    if(actions.length)dispatchBatch(actions,'Show all components');
  };

  return <div className="viewport-toolbar dcc-toolbar" data-testid="viewport-toolbar">
    <div className="toolbar-group history-tools">
      <button type="button" className="tool-button icon-only" aria-label="Undo" title={`Undo · ${key('undo')}`} disabled={!undoStack.length} onClick={undo}>
        <span className="tool-icon">↶</span><kbd>{key('undo')}</kbd>
      </button>
      <button type="button" className="tool-button icon-only" aria-label="Redo" title={`Redo · ${key('redo')}`} disabled={!redoStack.length} onClick={redo}>
        <span className="tool-icon">↷</span><kbd>{key('redo')}</kbd>
      </button>
    </div>

    {phase==='EDITOR'&&<>
      <span className="toolbar-divider"/>
      <div className="toolbar-group transform-tools" aria-label="Transform tools">
        <button type="button" aria-label="Transform position" className={`tool-button compact ${activeMode==='translate'?'active':''}`} title={`Move · ${key('move')}`} onClick={()=>setMode('translate')}>
          <span className="tool-icon axis-icon">↔</span><span>Move</span><kbd>{key('move')}</kbd>
        </button>
        <button type="button" aria-label="Transform orientation" className={`tool-button compact ${activeMode==='rotate'?'active':''}`} title={`Rotate · ${key('rotate')}`} onClick={()=>setMode('rotate')}>
          <span className="tool-icon">⟳</span><span>Rotate</span><kbd>{key('rotate')}</kbd>
        </button>
        <button type="button" aria-label="Transform size" className={`tool-button compact ${activeMode==='scale'?'active':''}`} disabled={!canScale} title={`Resize · ${key('scale')}`} onClick={()=>setMode('scale')}>
          <span className="tool-icon">⤢</span><span>Scale</span><kbd>{key('scale')}</kbd>
        </button>
      </div>

      <span className="toolbar-divider"/>
      <label className="toolbar-select compact-select" title="Transform orientation space">
        <span>Space</span>
        <select aria-label="Transform space" value={transformSpace} onChange={event=>setTransformSpace(event.target.value as TransformSpace)}>
          <option value="world">World</option>
          <option value="local">Local</option>
        </select>
      </label>

      <button type="button" aria-label="Grid transform snap" className={`tool-button compact ${gridSnapEnabled?'active':''}`} aria-pressed={gridSnapEnabled} onClick={toggleGridSnap} title={`Grid transform snap · ${key('toggleGridSnap')}`}>
        <span className="tool-icon">#</span><span>Grid</span><kbd>{key('toggleGridSnap')}</kbd>
      </button>
      {gridSnapEnabled&&<div className="toolbar-snap-step" title="Translation snap step">
        <input aria-label="Grid snap step mm" type="number" min="0.001" step="1" value={gridStepMm} onChange={event=>setGridStepMm(Number(event.target.value))}/><span>mm</span>
        <input aria-label="Rotation snap step degrees" type="number" min="0.1" max="180" step="1" value={rotationSnapDeg} onChange={event=>setRotationSnapDeg(Number(event.target.value))}/><span>°</span>
      </div>}

      <button type="button" aria-label="Anchor magnetic snap" className={`tool-button compact ${snapEnabled?'active':''}`} aria-pressed={snapEnabled} onClick={toggleSnap} title={`Anchor Magnetic Snap · ${key('toggleSnap')}`}>
        <span className="tool-icon">⌁</span><span>Anchor</span><kbd>{key('toggleSnap')}</kbd>
      </button>

      <span className="toolbar-divider"/>
      <div className="toolbar-group camera-tools">
        <button type="button" aria-label="Frame selected" className="tool-button compact" disabled={!selected} onClick={()=>requestFrame('selected')} title={`Frame selected · ${key('focusSelected')}`}>
          <span className="tool-icon">◎</span><span>Focus</span><kbd>{key('focusSelected')}</kbd>
        </button>
        <button type="button" aria-label="Frame all" className="tool-button compact" onClick={()=>requestFrame('all')} title={`Frame all · ${key('frameAll')}`}>
          <span className="tool-icon">□</span><span>All</span><kbd>{key('frameAll')}</kbd>
        </button>
      </div>

      <div className="toolbar-group visibility-tools" aria-label="Visibility tools">
        <button type="button" aria-label="Hide selected" className="tool-button compact" disabled={!selectedState?.visible||selectedState?.deleted} onClick={hideSelected} title={`Hide selected · ${key('hideSelected')}`}>
          <span className="tool-icon">◌</span><span>Hide</span><kbd>{key('hideSelected')}</kbd>
        </button>
        <button type="button" aria-label="Isolate selected" className="tool-button compact" disabled={!selected||selectedState?.deleted} onClick={isolateSelected} title={`Isolate selected · ${key('isolateSelected')}`}>
          <span className="tool-icon">◉</span><span>Solo</span><kbd>{key('isolateSelected')}</kbd>
        </button>
        <button type="button" aria-label="Show all components" className="tool-button compact" onClick={showAll} title={`Show all · ${key('showAll')}`}>
          <span className="tool-icon">◎</span><span>Show</span><kbd>{key('showAll')}</kbd>
        </button>
      </div>

      <div className="toolbar-group gizmo-tools" title={`Gizmo size ${Math.round(gizmoSize*100)}%`}>
        <button type="button" className="tool-button icon-only" aria-label="Decrease gizmo size" onClick={decreaseGizmo}>−</button>
        <span className="gizmo-scale-value">{Math.round(gizmoSize*100)}%</span>
        <button type="button" className="tool-button icon-only" aria-label="Increase gizmo size" onClick={increaseGizmo}>+</button>
      </div>
    </>}

    <span className="toolbar-divider"/>
    <label className="toolbar-select" title={`Component labels · ${key('toggleLabels')}`}>
      <span>Labels</span>
      <select aria-label="Component label display" value={labelMode} onChange={event=>setLabelMode(event.target.value as LabelMode)}>
        <option value="selected">Selected</option>
        <option value="all">All</option>
        <option value="off">Off</option>
      </select>
      <kbd>{key('toggleLabels')}</kbd>
    </label>

    <button type="button" className="tool-button compact settings-tool" aria-label="Keyboard shortcut settings" onClick={openSettings} title="Keyboard shortcuts">
      <span className="tool-icon">⌨</span><span>Keymap</span>
    </button>
  </div>;
}
