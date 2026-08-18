'use client';
import {useEffect,useState} from 'react';
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
  const list=Object.values(variants).filter(v=>(!definition?.variantGroupId||v.groupId===definition.variantGroupId)&&(!definition||v.role===definition.role));
  return <>
    <MeasurementPanel/>
    <div className="field-group"><div className="eyebrow">Style & Variant</div><label>Style</label><select defaultValue="" onChange={e=>{const style=styles.find(s=>s.id===e.target.value);if(style)applyRules(style.rulesJson,'STYLE',`Apply style ${style.name}`,style.id);}}><option value="">Choose style…</option>{styles.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>{definition&&state&&<><label>Variant</label><select value={state.variantId??''} disabled={!definition.variantGroupId} onChange={e=>{if(!e.target.value)dispatch({type:'RESET_COMPONENT',componentId:definition.id,source:'MANUAL'},'Reset component to original');else dispatch({type:'REPLACE_COMPONENT',componentId:definition.id,variantId:e.target.value,source:'MANUAL'},'Replace component variant');}}><option value="">Original component (reset)</option>{list.map((v:RuntimeVariant)=><option key={v.id} value={v.id}>{v.name} · {v.dimensionPolicy}</option>)}</select></>}</div>
    <PresetControls/>
    <AiManufacturingTools/>
    <CollectionWorkshopTools/>
  </>;
}
