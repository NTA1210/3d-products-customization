'use client';

import {create} from 'zustand';
import {createJSONStorage,persist} from 'zustand/middleware';
import {
  DEFAULT_SHORTCUT_BINDINGS,
  normalizeShortcutBinding,
  shortcutConflicts,
  type ShortcutAction,
} from './keyboard-shortcuts';

type ShortcutStore={
  bindings:Record<ShortcutAction,string>;
  settingsOpen:boolean;
  openSettings:()=>void;
  closeSettings:()=>void;
  setBinding:(action:ShortcutAction,binding:string)=>ShortcutAction|undefined;
  clearBinding:(action:ShortcutAction)=>void;
  resetDefaults:()=>void;
};

export const useShortcutStore=create<ShortcutStore>()(persist((set,get)=>({
  bindings:{...DEFAULT_SHORTCUT_BINDINGS},
  settingsOpen:false,
  openSettings:()=>set({settingsOpen:true}),
  closeSettings:()=>set({settingsOpen:false}),
  setBinding:(action,binding)=>{
    const normalized=normalizeShortcutBinding(binding);
    const current=get().bindings;
    const conflict=shortcutConflicts(current,action,normalized);
    const next={...current};
    if(conflict)next[conflict]='';
    next[action]=normalized;
    set({bindings:next});
    return conflict;
  },
  clearBinding:action=>set(state=>({bindings:{...state.bindings,[action]:''}})),
  resetDefaults:()=>set({bindings:{...DEFAULT_SHORTCUT_BINDINGS}}),
}),{
  name:'product3d-editor-shortcuts-v1',
  storage:createJSONStorage(()=>localStorage),
  partialize:state=>({bindings:state.bindings}) as ShortcutStore,
  merge:(persisted,current)=>{
    const saved=(persisted as Partial<ShortcutStore>|undefined)?.bindings;
    return{...current,bindings:{...DEFAULT_SHORTCUT_BINDINGS,...saved},settingsOpen:false};
  },
}));
