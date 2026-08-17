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
import {useShortcutStore} from '../lib/shortcut-store';
import {useEditorStore} from '../lib/store';
import {useSnapInteractionStore} from '../lib/snap-store';

function executeShortcut(action:ShortcutAction){
  const editor=useEditorStore.getState();
  const snap=useSnapInteractionStore.getState();
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
    case'toggleLabels':snap.toggleLabels();return;
    case'toggleSnap':snap.toggleSnap();return;
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
  const closeSettings=useShortcutStore(state=>state.closeSettings);
  const setBinding=useShortcutStore(state=>state.setBinding);
  const clearBinding=useShortcutStore(state=>state.clearBinding);
  const resetDefaults=useShortcutStore(state=>state.resetDefaults);
  const[capturing,setCapturing]=useState<ShortcutAction>();
  const[notice,setNotice]=useState<string>();
  const[apple,setApple]=useState(false);

  useEffect(()=>setApple(/Mac|iPhone|iPad|iPod/.test(navigator.platform)),[]);

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
          <div className="eyebrow">Preferences</div>
          <h2 id="shortcut-title">Keyboard shortcuts</h2>
          <p>Click một shortcut rồi nhấn tổ hợp phím mới. Thiết lập được lưu trên trình duyệt này.</p>
        </div>
        <button className="icon-button" type="button" aria-label="Close shortcut settings" onClick={closeSettings}>×</button>
      </div>

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
        <span>Esc hủy record · Shortcut không chạy khi bạn đang nhập text.</span>
        <div>
          <button type="button" onClick={()=>{resetDefaults();setNotice('Đã khôi phục shortcut mặc định.');}}>Reset defaults</button>
          <button className="primary" type="button" onClick={closeSettings}>Done</button>
        </div>
      </div>
    </section>
  </div>;
}
