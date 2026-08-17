'use client';

import {create} from 'zustand';

type MultiSelectionStore={
  ids:string[];
  setSingle:(id?:string)=>string[];
  toggle:(id:string)=>string[];
  clear:()=>void;
};

export const useMultiSelectionStore=create<MultiSelectionStore>((set,get)=>({
  ids:[],
  setSingle:id=>{
    const ids=id?[id]:[];
    set({ids});
    return ids;
  },
  toggle:id=>{
    const current=get().ids;
    const ids=current.includes(id)?current.filter(item=>item!==id):[...current,id];
    set({ids});
    return ids;
  },
  clear:()=>set({ids:[]}),
}));
