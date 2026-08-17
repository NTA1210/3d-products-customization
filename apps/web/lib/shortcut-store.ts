'use client';

import {create} from 'zustand';
import {createJSONStorage,persist} from 'zustand/middleware';
import {
  DEFAULT_SHORTCUT_BINDINGS,
  SHORTCUT_PRESETS,
  normalizeShortcutBinding,
  shortcutConflicts,
  type ShortcutAction,
  type ShortcutPreset,
} from './keyboard-shortcuts';

type ShortcutStore={
  bindings:Record<ShortcutAction,string>;
  settingsOpen:boolean;
  activePreset:'custom'|ShortcutPreset;
  openSettings:()=>void;
  closeSettings:()=>void;
  setBinding:(action:ShortcutAction,binding:string)=>ShortcutAction|undefined;
  clearBinding:(action:ShortcutAction)=>void;
  applyPreset:(preset:ShortcutPreset)=>void;
  resetDefaults:()=>void;
};

export const useShortcutStore=create<ShortcutStore>()(persist((set,get)=>({
  bindings:{...DEFAULT_SHORTCUT_BINDINGS},
  settingsOpen:false,
  activePreset:'maya',
  openSettings:()=>set({settingsOpen:true}),
  closeSettings:()=>set({settingsOpen:false}),
  setBinding:(action,binding)=>{
    const normalized=normalizeShortcutBinding(binding);
    const current=get().bindings;
    const conflict=shortcutConflicts(current,action,normalized);
    const next={...current};
    if(conflict)next[conflict]='';
    next[action]=normalized;
    set({bindings:next,activePreset:'custom'});
    return conflict;
  },
  clearBinding:action=>set(state=>({bindings:{...state.bindings,[action]:''},activePreset:'custom'})),
  applyPreset:preset=>set({bindings:{...SHORTCUT_PRESETS[preset]},activePreset:preset}),
  resetDefaults:()=>set({bindings:{...DEFAULT_SHORTCUT_BINDINGS},activePreset:'maya'}),
}),{
  name:'product3d-editor-shortcuts-v2',
  storage:createJSONStorage(()=>localStorage),
  partialize:state=>({bindings:state.bindings,activePreset:state.activePreset}) as ShortcutStore,
  merge:(persisted,current)=>{
    const saved=persisted as Partial<ShortcutStore>|undefined;
    return{...current,bindings:{...DEFAULT_SHORTCUT_BINDINGS,...saved?.bindings},activePreset:saved?.activePreset??'custom',settingsOpen:false};
  },
}));
