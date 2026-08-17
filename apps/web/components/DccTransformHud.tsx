'use client';

import {useEffect,useState} from 'react';
import {useDccViewportStore} from '../lib/dcc-viewport-store';
import {useEditorStore} from '../lib/store';
import {useMultiSelectionStore} from '../lib/multi-selection-store';

function NumericField({label,value,step=1,onCommit,disabled=false}:{label:string;value:number;step?:number;onCommit:(value:number)=>void;disabled?:boolean}){
  const[draft,setDraft]=useState(String(Math.round(value*1000)/1000));
  useEffect(()=>setDraft(String(Math.round(value*1000)/1000)),[value]);
  const commit=()=>{
    const next=Number(draft);
    if(Number.isFinite(next)&&Math.abs(next-value)>1e-9)onCommit(next);
    else setDraft(String(Math.round(value*1000)/1000));
  };
  return <label className="channel-field">
    <span>{label}</span>
    <input
      type="number"
      value={draft}
      step={step}
      disabled={disabled}
      onChange={event=>setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event=>{
        if(event.key==='Enter')event.currentTarget.blur();
        if(event.key==='Escape'){setDraft(String(Math.round(value*1000)/1000));event.currentTarget.blur();}
      }}
    />
  </label>;
}

export default function DccTransformHud(){
  const phase=useEditorStore(state=>state.phase);
  const selected=useEditorStore(state=>state.selected);
  const manifest=useEditorStore(state=>state.manifest);
  const configuration=useEditorStore(state=>state.configuration);
  const dispatch=useEditorStore(state=>state.dispatch);
  const dispatchBatch=useEditorStore(state=>state.dispatchBatch);
  const selectedIds=useMultiSelectionStore(state=>state.ids);
  const transformSpace=useDccViewportStore(state=>state.transformSpace);
  const gridSnapEnabled=useDccViewportStore(state=>state.gridSnapEnabled);
  const gridStepMm=useDccViewportStore(state=>state.gridStepMm);
  const requestFrame=useDccViewportStore(state=>state.requestFrame);

  if(phase!=='EDITOR'||!configuration?.placement.locked||!selected)return null;
  const definition=manifest?.components.find(item=>item.id===selected);
  const state=configuration.components[selected];
  if(!definition||!state||!manifest)return null;

  if(selectedIds.length>1){
    const editableCount=selectedIds.filter(id=>{
      const item=manifest.components.find(component=>component.id===id);
      const itemState=configuration.components[id];
      return Boolean(item?.editable&&itemState?.visible&&!itemState.deleted);
    }).length;
    return <section className="transform-channel-box" data-testid="multi-transform-channel-box">
      <div className="channel-heading">
        <div>
          <span className="eyebrow">Group Selection</span>
          <strong>{selectedIds.length} components selected</strong>
        </div>
        <button type="button" onClick={()=>requestFrame('all')} title="Frame all · Home">Home</button>
      </div>
      <div className="channel-meta">
        <span>{transformSpace.toUpperCase()}</span>
        <span>{editableCount} EDITABLE</span>
      </div>
      <div className="channel-section">
        <span className="channel-section-title">Group transform</span>
        <p className="hint compact-hint">
          <b>Shift + click</b> thêm/bỏ part · <b>W</b> Move · <b>E</b> Rotate. Một gizmo chung nằm ở tâm selection.
        </p>
        <p className="hint compact-hint">
          Group Scale và Anchor Snap tạm khóa vì constraint/anchor thuộc từng component.
        </p>
      </div>
      <div className="channel-actions">
        <button type="button" onClick={()=>useMultiSelectionStore.getState().setSingle(selected)}>Keep primary only</button>
        <button type="button" onClick={()=>requestFrame('all')}>Frame all</button>
      </div>
    </section>;
  }

  const setPosition=(axis:'X'|'Y'|'Z',value:number)=>dispatch({type:'SET_POSITION',componentId:selected,axis,value,source:'MANUAL'},`Set ${axis} position`);
  const setRotation=(axis:'X'|'Y'|'Z',degrees:number)=>dispatch({type:'SET_ROTATION',componentId:selected,axis,value:degrees*Math.PI/180,source:'MANUAL'},`Set ${axis} rotation`);
  const setDimension=(axis:'WIDTH'|'HEIGHT'|'DEPTH',value:number)=>dispatch({type:'SET_DIMENSION',componentId:selected,axis,valueMm:Math.max(.001,value),source:'MANUAL'},`Set ${axis.toLowerCase()}`);
  const resetTransform=()=>dispatchBatch([
    ...(['X','Y','Z'] as const).map(axis=>({type:'SET_POSITION' as const,componentId:selected,axis,value:0,source:'MANUAL' as const})),
    ...(['X','Y','Z'] as const).map(axis=>({type:'SET_ROTATION' as const,componentId:selected,axis,value:0,source:'MANUAL' as const})),
  ],`Reset transform ${definition.name}`);

  const canResize=definition.editable&&definition.scalingMode==='AXIS_SCALE';
  const widthAxis=manifest.axisMapping.width;
  const heightAxis=manifest.axisMapping.height;
  const depthAxis=manifest.axisMapping.depth;
  return <section className="transform-channel-box" data-testid="transform-channel-box">
    <div className="channel-heading">
      <div>
        <span className="eyebrow">Channel Box</span>
        <strong title={definition.name}>{definition.name}</strong>
      </div>
      <button type="button" onClick={()=>requestFrame('selected')} title="Frame selected · F">F</button>
    </div>
    <div className="channel-meta">
      <span>{transformSpace.toUpperCase()}</span>
      <span>{gridSnapEnabled?`GRID ${gridStepMm} mm`:'FREE'}</span>
    </div>
    <div className="channel-section">
      <span className="channel-section-title">Position · mm</span>
      <div className="channel-grid">
        {(['X','Y','Z'] as const).map((axis,index)=><NumericField key={axis} label={axis} value={state.transform.position[index]} onCommit={value=>setPosition(axis,value)} disabled={!definition.editable}/>)}
      </div>
    </div>
    <div className="channel-section">
      <span className="channel-section-title">Rotation · °</span>
      <div className="channel-grid">
        {(['X','Y','Z'] as const).map((axis,index)=><NumericField key={axis} label={axis} step={1} value={state.transform.rotation[index]*180/Math.PI} onCommit={value=>setRotation(axis,value)} disabled={!definition.editable}/>)}
      </div>
    </div>
    <div className="channel-section">
      <span className="channel-section-title">Dimensions · mm</span>
      <div className="channel-grid">
        <NumericField label="W" value={state.dimensionsMm.width} onCommit={value=>setDimension('WIDTH',value)} disabled={!canResize||!definition.editableAxes[widthAxis]}/>
        <NumericField label="H" value={state.dimensionsMm.height} onCommit={value=>setDimension('HEIGHT',value)} disabled={!canResize||!definition.editableAxes[heightAxis]}/>
        <NumericField label="D" value={state.dimensionsMm.depth} onCommit={value=>setDimension('DEPTH',value)} disabled={!canResize||!definition.editableAxes[depthAxis]}/>
      </div>
    </div>
    <div className="channel-actions">
      <button type="button" onClick={resetTransform} disabled={!definition.editable}>Reset transform</button>
      <button type="button" onClick={()=>requestFrame('all')} title="Frame all · Home">Frame all</button>
    </div>
  </section>;
}
