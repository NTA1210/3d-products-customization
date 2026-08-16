'use client';

import {create} from 'zustand';

export type RuntimeMeasurement={
  widthMm:number;
  heightMm:number;
  depthMm:number;
  minMm:[number,number,number];
  maxMm:[number,number,number];
  centerMm:[number,number,number];
};

export type SelectedRuntimeMeasurement=RuntimeMeasurement&{componentId:string};

type MeasurementStore={
  model?:RuntimeMeasurement;
  selected?:SelectedRuntimeMeasurement;
  setMeasurements:(model?:RuntimeMeasurement,selected?:SelectedRuntimeMeasurement)=>void;
  reset:()=>void;
};

function same(a?:RuntimeMeasurement,b?:RuntimeMeasurement){
  if(!a||!b)return a===b;
  const av=[a.widthMm,a.heightMm,a.depthMm,...a.minMm,...a.maxMm,...a.centerMm];
  const bv=[b.widthMm,b.heightMm,b.depthMm,...b.minMm,...b.maxMm,...b.centerMm];
  return av.every((value,index)=>Math.abs(value-bv[index])<.01);
}

export const useMeasurementStore=create<MeasurementStore>((set,get)=>({
  setMeasurements:(model,selected)=>{
    const current=get();
    if(same(current.model,model)&&current.selected?.componentId===selected?.componentId&&same(current.selected,selected))return;
    set({model,selected});
  },
  reset:()=>set({model:undefined,selected:undefined}),
}));
