'use client';

import {useEffect,useMemo,useState} from 'react';
import {deletePreset,getPresets,savePreset,type UserPresetRecord} from '../lib/catalog-api';
import {presetRulesFromConfiguration} from '../lib/configuration-presets';
import {useEditorStore} from '../lib/store';

export default function PresetControls(){
  const store=useEditorStore();
  const[presets,setPresets]=useState<UserPresetRecord[]>([]);
  const[selectedPresetId,setSelectedPresetId]=useState('');
  const[name,setName]=useState('');
  const[busy,setBusy]=useState<'load'|'save'|'delete'>();
  const locked=Boolean(store.configuration?.placement.locked);
  const activePresetId=store.configuration?.appliedPresetId;
  const selectedPreset=useMemo(()=>presets.find(item=>item.id===selectedPresetId),[presets,selectedPresetId]);
  const activePreset=useMemo(()=>presets.find(item=>item.id===activePresetId),[presets,activePresetId]);

  const fail=(error:unknown,fallback:string)=>useEditorStore.setState({error:error instanceof Error?error.message:fallback});
  const refresh=async()=>{
    setBusy('load');
    try{
      const rows=await getPresets();
      setPresets(rows);
      setSelectedPresetId(current=>current&&rows.some(item=>item.id===current)?current:(store.configuration?.appliedPresetId&&rows.some(item=>item.id===store.configuration?.appliedPresetId)?store.configuration.appliedPresetId:(rows[0]?.id??'')));
    }catch(error){fail(error,'Could not load presets.');}
    finally{setBusy(undefined);}
  };

  useEffect(()=>{if(store.phase==='EDITOR')void refresh();},[store.phase,store.projectId]);

  const applySelected=()=>{
    if(!selectedPreset)return;
    store.applyRules(selectedPreset.rulesJson,'PRESET',`Apply preset ${selectedPreset.name}`,selectedPreset.id);
  };

  const resetActive=()=>{
    if(!activePreset)return;
    if(typeof window!=='undefined'&&!window.confirm(`Reset the product back to preset “${activePreset.name}”? Manual fine-tuning after the preset will be removed.`))return;
    store.resetPreset(activePreset.rulesJson,activePreset.id,`Reset preset ${activePreset.name}`);
  };

  const resetProduct=()=>{
    if(typeof window!=='undefined'&&!window.confirm('Reset all product customization? Placement will stay locked and in its current scene position.'))return;
    store.resetModel();
  };

  const saveCurrent=async()=>{
    if(!store.manifest||!store.configuration||!name.trim())return;
    const rules=presetRulesFromConfiguration(store.manifest,store.configuration);
    if(!rules.length){useEditorStore.setState({error:'There is no customizable state to save as a preset.'});return;}
    setBusy('save');
    try{
      const saved=await savePreset(name.trim(),rules);
      const normalized={...saved,rulesJson:rules};
      setPresets(current=>[normalized,...current.filter(item=>item.id!==saved.id)]);
      setSelectedPresetId(saved.id);
      setName('');
    }catch(error){fail(error,'Could not save preset.');}
    finally{setBusy(undefined);}
  };

  const removeSelected=async()=>{
    if(!selectedPreset)return;
    if(typeof window!=='undefined'&&!window.confirm(`Delete preset “${selectedPreset.name}”?`))return;
    setBusy('delete');
    try{
      await deletePreset(selectedPreset.id);
      setPresets(current=>current.filter(item=>item.id!==selectedPreset.id));
      setSelectedPresetId('');
    }catch(error){fail(error,'Could not delete preset.');}
    finally{setBusy(undefined);}
  };

  return <div className="field-group" data-testid="preset-controls">
    <div className="eyebrow">Preset Library</div>
    <p className="hint">Preset là cấu hình tái sử dụng. Apply xong vẫn có thể fine-tune bằng Manual; Reset Preset sẽ quay về đúng baseline của preset.</p>
    <label>Preset</label>
    <select value={selectedPresetId} disabled={busy==='load'||!presets.length} onChange={event=>setSelectedPresetId(event.target.value)}>
      <option value="">{busy==='load'?'Loading presets…':'Choose preset…'}</option>
      {presets.map(item=><option key={item.id} value={item.id}>{item.name}{item.id===activePresetId?' · active':''}</option>)}
    </select>
    <div className="row">
      <button type="button" disabled={!locked||!selectedPreset} onClick={applySelected}>Apply Preset</button>
      <button type="button" disabled={!locked||!activePreset} onClick={resetActive}>Reset Preset</button>
    </div>
    {activePresetId&&<p className="hint compact-hint">Active preset: <b>{activePreset?.name??activePresetId}</b>{!activePreset?' · preset record is not available':''}</p>}

    <label>Save current customization as preset</label>
    <input value={name} maxLength={80} placeholder="e.g. Dining Table · Walnut 1600" onChange={event=>setName(event.target.value)}/>
    <div className="row">
      <button type="button" disabled={!locked||!name.trim()||Boolean(busy)} onClick={()=>void saveCurrent()}>{busy==='save'?'Saving…':'Save Preset'}</button>
      <button type="button" disabled={!selectedPreset||Boolean(busy)} onClick={()=>void removeSelected()}>{busy==='delete'?'Deleting…':'Delete Preset'}</button>
    </div>

    <div className="eyebrow" style={{marginTop:8}}>Product Reset</div>
    <button type="button" className="full" disabled={!locked} onClick={resetProduct}>Reset Product</button>
    <p className="hint compact-hint">Reset Product clears component size/material/color/variant/visibility/attachments and applied style/preset, while preserving the approved model placement.</p>
  </div>;
}
