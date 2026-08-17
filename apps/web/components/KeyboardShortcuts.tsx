'use client';

import {useEffect,useState} from 'react';
import {
  SHORTCUT_DEFINITIONS,
  isEditableKeyboardTarget,
  shortcutDisplay,
  shortcutFromEvent,
  shortcutMatches,
  type ShortcutAction,
} from '../lib/keyboard-shortcuts';
import {useDccViewportStore} from '../lib/dcc-viewport-store';
import {useShortcutStore} from '../lib/shortcut-store';
import {useEditorStore} from '../lib/store';
import {useSnapInteractionStore} from '../lib/snap-store';

function executeShortcut(action:ShortcutAction){
  const editor=useEditorStore.getState();
  const snap=useSnapInteractionStore.getState();
  const dcc=useDccViewportStore.getState();
  switch(action){
    case'undo':editor.undo();return;
    case'redo':editor.redo();return;
    case'move':
      if(editor.phase!=='EDITOR')return;
      if(editor.configuration?.placement.locked)editor.setComponentMode('translate');
      else editor.setPlacementMode('translate');
      return;
    case'rotate':
      if(editor.phase!=='EDITOR')return;
      if(editor.configuration?.placement.locked)editor.setComponentMode('rotate');
      else editor.setPlacementMode('rotate');
      return;
    case'scale':{
      if(editor.phase!=='EDITOR'||!editor.configuration?.placement.locked)return;
      const definition=editor.manifest?.components.find(item=>item.id===editor.selected);
      const canResize=Boolean(definition?.editable&&definition.scalingMode==='AXIS_SCALE'&&Object.values(definition.editableAxes).some(Boolean));
      if(canResize)editor.setComponentMode('scale');
      return;
    }
    case'focusSelected':if(editor.selected)dcc.requestFrame('selected');return;
    case'frameAll':dcc.requestFrame('all');return;
    case'toggleGridSnap':dcc.toggleGridSnap();return;
    case'hideSelected':{
      if(editor.phase!=='EDITOR'||!editor.selected)return;
      const state=editor.configuration?.components[editor.selected];
      if(!state||state.deleted||!state.visible)return;
      editor.dispatch({type:'SET_VISIBILITY',componentId:editor.selected,visible:false,source:'MANUAL'},'Hide selected component');
      return;
    }
    case'isolateSelected':{
      if(editor.phase!=='EDITOR'||!editor.selected||!editor.configuration||!editor.manifest)return;
      const actions=editor.manifest.components.flatMap(definition=>{
        const state=editor.configuration?.components[definition.id];
        if(!state||state.deleted)return[];
        const visible=definition.id===editor.selected;
        if(state.visible===visible)return[];
        return[{type:'SET_VISIBILITY' as const,componentId:definition.id,visible,source:'MANUAL' as const}];
      });
      if(actions.length)editor.dispatchBatch(actions,'Isolate selected component');
      return;
    }
    case'showAll':{
      if(editor.phase!=='EDITOR'||!editor.configuration||!editor.manifest)return;
      const actions=editor.manifest.components.flatMap(definition=>{
        const state=editor.configuration?.components[definition.id];
        if(!state||state.deleted||state.visible)return[];
        return[{type:'SET_VISIBILITY' as const,componentId:definition.id,visible:true,source:'MANUAL' as const}];
      });
      if(actions.length)editor.dispatchBatch(actions,'Show all components');
      return;
    }
    case'toggleLabels':snap.toggleLabels();return;
    case'toggleSnap':snap.toggleSnap();return;
    case'toggleAttach':{
      if(editor.phase!=='EDITOR'||!editor.configuration?.placement.locked||!editor.selected)return;
      editor.setComponentMode('translate');
      snap.toggleAttachMode();
      return;
    }
    case'gizmoIncrease':dcc.increaseGizmo();return;
    case'gizmoDecrease':dcc.decreaseGizmo();return;
    case'deleteSelected':{
      if(editor.phase!=='EDITOR'||!editor.selected)return;
      const state=editor.configuration?.components[editor.selected];
      if(!state||state.deleted)return;
      editor.dispatch({type:'DELETE_COMPONENT',componentId:editor.selected,source:'MANUAL'},'Delete component');
      return;
    }
  }
}

export default function KeyboardShortcuts(){
  const bindings=useShortcutStore(state=>state.bindings);
  const settingsOpen=useShortcutStore(state=>state.settingsOpen);
  const activePreset=useShortcutStore(state=>state.activePreset);
  const closeSettings=useShortcutStore(state=>state.closeSettings);
  const setBinding=useShortcutStore(state=>state.setBinding);
  const clearBinding=useShortcutStore(state=>state.clearBinding);
  const applyPreset=useShortcutStore(state=>state.applyPreset);
  const resetDefaults=useShortcutStore(state=>state.resetDefaults);
  const[capturing,setCapturing]=useState<ShortcutAction>();
  const[notice,setNotice]=useState<string>();
  const[apple,setApple]=useState(false);

  useEffect(()=>setApple(/Mac|iPhone|iPad|iPod/.test(navigator.platform)),[]);

  useEffect(()=>{
    const setAlt=(active:boolean)=>useDccViewportStore.getState().setAltNavigation(active);
    const setTemporarySnap=(active:boolean)=>useSnapInteractionStore.getState().setTemporarySnap(active);
    const down=(event:KeyboardEvent)=>{
      if(event.key==='Alt')setAlt(true);
      if(event.key==='Control')setTemporarySnap(true);
    };
    const up=(event:KeyboardEvent)=>{
      if(event.key==='Alt')setAlt(false);
      if(event.key==='Control')setTemporarySnap(false);
    };
    const blur=()=>{setAlt(false);setTemporarySnap(false);};
    window.addEventListener('keydown',down,{capture:true});
    window.addEventListener('keyup',up,{capture:true});
    window.addEventListener('blur',blur);
    return()=>{
      window.removeEventListener('keydown',down,{capture:true});
      window.removeEventListener('keyup',up,{capture:true});
      window.removeEventListener('blur',blur);
      setAlt(false);setTemporarySnap(false);
    };
  },[]);

  useEffect(()=>{
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.repeat)return;
      if(capturing){
        event.preventDefault();
        event.stopPropagation();
        if(event.key==='Escape'){
          setCapturing(undefined);
          setNotice(undefined);
          return;
        }
        const binding=shortcutFromEvent(event);
        if(!binding)return;
        const conflict=setBinding(capturing,binding);
        const definition=SHORTCUT_DEFINITIONS.find(item=>item.action===capturing);
        const conflictDefinition=SHORTCUT_DEFINITIONS.find(item=>item.action===conflict);
        setNotice(conflictDefinition
          ?`${shortcutDisplay(binding,apple)} đã chuyển từ “${conflictDefinition.label}” sang “${definition?.label}”.`
          :`${definition?.label} = ${shortcutDisplay(binding,apple)}`);
        setCapturing(undefined);
        return;
      }
      if(settingsOpen||isEditableKeyboardTarget(event.target))return;
      if(event.key==='Escape'&&useSnapInteractionStore.getState().attachMode){
        event.preventDefault();
        useSnapInteractionStore.getState().setAttachMode(false);
        useSnapInteractionStore.getState().setCandidate(undefined);
        return;
      }
      const definition=SHORTCUT_DEFINITIONS.find(item=>shortcutMatches(event,bindings[item.action]));
      if(!definition)return;
      event.preventDefault();
      executeShortcut(definition.action);
    };
    window.addEventListener('keydown',onKeyDown,{capture:true});
    return()=>window.removeEventListener('keydown',onKeyDown,{capture:true});
  },[apple,bindings,capturing,setBinding,settingsOpen]);

  useEffect(()=>{
    if(!settingsOpen){setCapturing(undefined);setNotice(undefined);}
  },[settingsOpen]);

  if(!settingsOpen)return null;

  return <div className="shortcut-backdrop" role="presentation" onMouseDown={event=>{
    if(event.target===event.currentTarget)closeSettings();
  }}>
    <section className="shortcut-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcut-title" data-testid="shortcut-settings">
      <div className="dialog-heading">
        <div>
          <div className="eyebrow">Preferences · DCC keymap</div>
          <h2 id="shortcut-title">Keyboard shortcuts</h2>
          <p>Chọn preset quen thuộc rồi tùy biến. Click một shortcut và nhấn tổ hợp phím mới.</p>
        </div>
        <button className="icon-button" type="button" aria-label="Close shortcut settings" onClick={closeSettings}>×</button>
      </div>

      <div className="shortcut-presets" aria-label="Keymap presets">
        <button type="button" className={activePreset==='maya'?'active':''} onClick={()=>{applyPreset('maya');setNotice('Đã áp dụng Maya / Standard DCC keymap.');}}>Maya / Standard</button>
        <button type="button" className={activePreset==='blender'?'active':''} onClick={()=>{applyPreset('blender');setNotice('Đã áp dụng Blender-style transform keymap.');}}>Blender style</button>
        {activePreset==='custom'&&<span>Custom keymap</span>}
      </div>

      <div className="shortcut-notice">Giữ <b>Ctrl</b> trong lúc Move để bật Anchor Snap tạm thời. Snap chỉ căn vị trí; dùng <b>Attach mode</b> nếu muốn tạo relationship.</div>
      {notice&&<div className="shortcut-notice">{notice}</div>}

      <div className="shortcut-table" role="table" aria-label="Keyboard shortcut configuration">
        <div className="shortcut-row shortcut-row-head" role="row">
          <span>Action</span><span>Shortcut</span><span/>
        </div>
        {SHORTCUT_DEFINITIONS.map(item=>{
          const recording=capturing===item.action;
          return <div className={`shortcut-row ${recording?'recording':''}`} role="row" key={item.action}>
            <div>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </div>
            <button
              type="button"
              className="shortcut-key-button"
              aria-label={`Change shortcut for ${item.label}`}
              onClick={()=>{setNotice(undefined);setCapturing(item.action);}}
            >
              {recording?<span className="recording-text">Press keys…</span>:<kbd>{shortcutDisplay(bindings[item.action],apple)}</kbd>}
            </button>
            <button className="shortcut-clear" type="button" disabled={!bindings[item.action]} onClick={()=>clearBinding(item.action)}>Clear</button>
          </div>;
        })}
      </div>

      <div className="dialog-footer">
        <span>Esc hủy record / Attach mode · Shortcut không chạy khi bạn đang nhập text.</span>
        <div>
          <button type="button" onClick={()=>{resetDefaults();setNotice('Đã khôi phục Maya / Standard DCC defaults.');}}>Reset defaults</button>
          <button className="primary" type="button" onClick={closeSettings}>Done</button>
        </div>
      </div>
    </section>
  </div>;
}
