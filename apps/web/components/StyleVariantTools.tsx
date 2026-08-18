'use client';
import {useEffect,useState} from 'react';
import {canApplyVariant} from '@product3d/compatibility-engine';
import {getStyles,getVariants,type RuntimeVariant,type StyleRecord} from '../lib/catalog-api';
import {useEditorStore} from '../lib/store';
import AiManufacturingTools from './AiManufacturingTools';
import CollectionWorkshopTools from './CollectionWorkshopTools';
import MeasurementPanel from './MeasurementPanel';
import PresetControls from './PresetControls';

export default function StyleVariantTools(){
  const{assetId,manifest,selected,configuration,setVariants,variants,dispatch,applyRules}=useEditorStore();
  const[styles,setStyles]=useState<StyleRecord[]>([]);
  const definition=manifest?.components.find(c=>c.id===selected),state=selected?configuration?.components[selected]:undefined;
  useEffect(()=>{void getStyles().then(setStyles).catch(e=>useEditorStore.setState({error:e instanceof Error?e.message:'Could not load styles.'}));},[]);
  useEffect(()=>{if(!definition)return;let cancelled=false;void getVariants(definition.variantGroupId,definition.role).then(items=>{if(!cancelled)setVariants(items);}).catch(e=>{if(!cancelled)useEditorStore.setState({error:e instanceof Error?e.message:'Could not load variants.'});});return()=>{cancelled=true;};},[assetId,definition?.id,definition?.variantGroupId,definition?.role,setVariants]);
  const list=definition&&manifest?Object.values(variants).filter(v=>canApplyVariant(definition,v,manifest.modelTags??[],manifest.anchors??[])):[];
  return <>
    <MeasurementPanel/>
    <div className="field-group"><div className="eyebrow">Style & Variant</div><label>Style</label><select defaultValue="" onChange={e=>{const style=styles.find(s=>s.id===e.target.value);if(style)applyRules(style.rulesJson,'STYLE',`Apply style ${style.name}`,style.id);}}><option value="">Choose style…</option>{styles.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>{definition&&state&&<><label>Variant</label><select value={state.variantId??''} disabled={!definition.variantGroupId} onChange={e=>{if(!e.target.value)dispatch({type:'RESET_COMPONENT',componentId:definition.id,source:'MANUAL'},'Reset component to original');else dispatch({type:'REPLACE_COMPONENT',componentId:definition.id,variantId:e.target.value,source:'MANUAL'},'Replace component variant');}}><option value="">Original component (reset)</option>{list.map((v:RuntimeVariant)=><option key={v.id} value={v.id}>{v.name} · {v.dimensionPolicy} · {v.anchorType}</option>)}</select>{definition.variantGroupId&&list.length===0?<p className="hint">No compatible variants for the current model tags, component role and semantic anchors.</p>:null}</>}</div>
    <PresetControls/>
    <AiManufacturingTools/>
    <CollectionWorkshopTools/>
  </>;
}
