'use client';
import {useMemo,useRef,useState} from 'react';
import type {ComponentRole} from '@product3d/model-schema';
import {ComponentRole as ComponentRoleSchema} from '@product3d/model-schema';
import ModelViewport from './ModelViewport';
import {useEditorStore} from '../lib/store';
import {demoMaterials} from '../lib/materials';
import {startAssetPipeline,type AssetPipelineStatus} from '../lib/asset-api';

const roles=ComponentRoleSchema.options as ComponentRole[];

function AssetPreparation(){
  const {manifest,selected,patchComponentDefinition,setRole,openEditor}=useEditorStore();
  const component=manifest?.components.find(item=>item.id===selected);
  if(!component)return <p className="muted">Select a detected mesh/region to configure it.</p>;
  const setAxis=(axis:'x'|'y'|'z',checked:boolean)=>patchComponentDefinition(component.id,{editableAxes:{...component.editableAxes,[axis]:checked},scalingMode:checked?'AXIS_SCALE':component.scalingMode});
  return <>
    <div className="eyebrow">Asset Preparation</div><h3>{component.name}</h3>
    <label>Semantic role</label><select value={component.role} onChange={e=>setRole(component.id,e.target.value as ComponentRole)}>{roles.map(role=><option key={role}>{role}</option>)}</select>
    <label className="check"><input type="checkbox" checked={component.editable} onChange={e=>patchComponentDefinition(component.id,{editable:e.target.checked,scalingMode:e.target.checked?'AXIS_SCALE':'FIXED'})}/> Editable component</label>
    <div className="field-group"><span className="muted">Editable axes</span>{(['x','y','z'] as const).map(axis=><label className="check inline" key={axis}><input type="checkbox" disabled={!component.editable} checked={component.editableAxes[axis]} onChange={e=>setAxis(axis,e.target.checked)}/>{axis.toUpperCase()}</label>)}</div>
    <p className="hint">Detected meshes are candidates only. Review roles/editability before entering the editor.</p>
    <button className="primary full" disabled={!manifest?.components.length} onClick={openEditor}>Save Manifest & Open Editor</button>
  </>;
}

function Inspector(){
  const {manifest,configuration,selected,dispatch,toggleLock,placementMode,setPlacementMode}=useEditorStore();
  const definition=manifest?.components.find(item=>item.id===selected);const state=selected?configuration?.components[selected]:undefined;
  if(!configuration)return <p className="muted">Upload a GLB model to begin.</p>;
  if(!configuration.placement.locked)return <><div className="eyebrow">Placement mode</div><h3>Position the whole product</h3><div className="segmented"><button className={placementMode==='translate'?'active':''} onClick={()=>setPlacementMode('translate')}>Move</button><button className={placementMode==='rotate'?'active':''} onClick={()=>setPlacementMode('rotate')}>Rotate</button></div><p className="hint">Component customization remains disabled until placement is locked.</p><button className="primary full" onClick={toggleLock}>Lock placement</button></>;
  if(!definition||!state)return <><h3>Inspector</h3><p className="muted">Select a component in the tree or directly in the viewer.</p><button className="full" onClick={toggleLock}>Unlock placement</button></>;
  const dimension=(axis:'WIDTH'|'HEIGHT'|'DEPTH',value:number)=>dispatch({type:'SET_DIMENSION',componentId:definition.id,axis,valueMm:value,source:'MANUAL'},`Set ${axis.toLowerCase()}`);
  return <><div className="eyebrow">Inspector</div><h3>{definition.name}</h3><p className="badge">{definition.role}</p>
    {(['WIDTH','HEIGHT','DEPTH'] as const).map(axis=>{const key=axis.toLowerCase() as 'width'|'height'|'depth';const mapped=manifest!.axisMapping[key];const enabled=definition.editable&&definition.editableAxes[mapped]&&definition.scalingMode==='AXIS_SCALE';return <div key={axis}><label>{axis[0]+axis.slice(1).toLowerCase()} (mm)</label><input type="number" disabled={!enabled} value={Math.round(state.dimensionsMm[key]*100)/100} onChange={e=>dimension(axis,Number(e.target.value))}/></div>})}
    <label>Material</label><select disabled={!definition.editable} value={state.materialId??''} onChange={e=>e.target.value&&dispatch({type:'SET_MATERIAL',componentId:definition.id,materialId:e.target.value,source:'MANUAL'},'Change material')}><option value="">Original material</option>{demoMaterials.map(material=><option key={material.id} value={material.id}>{material.name} · {material.category}</option>)}</select>
    <label>Color override</label><input disabled={!definition.editable} type="color" value={state.color??'#b8895b'} onChange={e=>dispatch({type:'SET_COLOR',componentId:definition.id,color:e.target.value,source:'MANUAL'},'Change color')}/>
    <div className="row"><button onClick={()=>dispatch({type:'RESET_COMPONENT',componentId:definition.id,source:'MANUAL'},'Reset component')}>Reset component</button><button onClick={toggleLock}>Unlock placement</button></div>
  </>;
}

export default function EditorShell(){
  const store=useEditorStore();
  const [pipelineStatus,setPipelineStatus]=useState<AssetPipelineStatus>('idle');
  const pipelineAbort=useRef<AbortController|null>(null);
  const selectedDefinition=store.manifest?.components.find(item=>item.id===store.selected);
  const canUndo=store.undoStack.length>0,canRedo=store.redoStack.length>0;
  const status=useMemo(()=>store.phase==='EMPTY'?'No asset loaded':store.phase==='PREPARE'?'Asset Preparation':store.configuration?.placement.locked?'Placement Locked · Customization Enabled':'Placement Unlocked · Placement Mode',[store.phase,store.configuration?.placement.locked]);
  const upload=async(file?:File)=>{if(!file)return;if(!file.name.toLowerCase().endsWith('.glb')){useEditorStore.setState({error:'Phase 1 accepts GLB as the canonical editor input.'});return;}pipelineAbort.current?.abort();pipelineAbort.current=new AbortController();if(store.assetUrl)URL.revokeObjectURL(store.assetUrl);store.setUploadedAsset(file.name,URL.createObjectURL(file));try{await startAssetPipeline(file,setPipelineStatus,pipelineAbort.current.signal);}catch(error){if(error instanceof DOMException&&error.name==='AbortError')return;setPipelineStatus('failed');useEditorStore.setState({error:error instanceof Error?error.message:'Asset pipeline failed.'});}};
  const exportConfiguration=()=>{if(!store.manifest||!store.configuration)return;const blob=new Blob([JSON.stringify({manifest:store.manifest,configuration:store.configuration},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`${store.assetName??'product'}.configuration.json`;anchor.click();URL.revokeObjectURL(url);};
  return <div className="shell">
    <header className="top"><div><strong>3D Product Configurator</strong><span className="muted project">{store.assetName??'Phase 1 Foundation'}</span></div><div className="top-actions"><label className="upload">Import GLB<input type="file" accept=".glb,model/gltf-binary" onChange={e=>void upload(e.target.files?.[0])}/></label><button disabled={!canUndo} onClick={store.undo}>Undo</button><button disabled={!canRedo} onClick={store.redo}>Redo</button><button disabled={!store.configuration} onClick={exportConfiguration}>Save Configuration</button><button className="primary" disabled={!store.configuration?.placement.locked} title="GLB baking/export worker is the next P0 slice">Export GLB</button></div></header>
    <div className="layout"><aside className="panel"><div className="eyebrow">Components</div><h3>{store.phase==='PREPARE'?'Detected candidates':'Component tree'}</h3>{!store.manifest&&<p className="muted">Import a GLB model. The analyzer will list mesh candidates without claiming semantic parts.</p>}{store.manifest?.components.length===1&&<div className="warning">This asset contains only one editable mesh candidate. Semantic splitting is not assumed.</div>}{store.manifest?.components.map(component=><button key={component.id} className={`component-card ${store.selected===component.id?'active':''}`} onClick={()=>store.select(component.id)}><span>{component.name}</span><small>{component.role} · {component.editable?'editable':'fixed'}</small></button>)}</aside>
      <main className="viewer"><ModelViewport/>{store.phase==='EMPTY'&&<div className="empty-state"><div className="empty-icon">3D</div><h2>Import a customer GLB</h2><p>Canonical input for the Phase 1 editor. No AI-generated geometry is used in the core flow.</p></div>}</main>
      <aside className="panel right">{store.phase==='PREPARE'?<AssetPreparation/>:<Inspector/>}{store.error&&<div className="error" onClick={store.clearError}>{store.error}</div>}{selectedDefinition&&store.phase==='PREPARE'&&<p className="source-id">Source: {selectedDefinition.sourceNodeIds[0]}</p>}</aside></div>
    <footer className="status"><span className={`dot ${store.configuration?.placement.locked?'ok':''}`}/>{status}<span>Asset pipeline: {pipelineStatus}</span><span>Canonical unit: mm</span><span>Runtime scene = projection of manifest + configuration</span></footer>
  </div>;
}
