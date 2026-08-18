'use client';
import {useEffect,useState} from 'react';
import type {ColorPreset} from '@product3d/model-schema';
import {canApplyVariant} from '@product3d/compatibility-engine';
import {getColors,getMaterials,getStyles,getVariants,type RuntimeVariant,type StyleRecord} from '../lib/catalog-api';
import {useEditorStore} from '../lib/store';
import AiManufacturingTools from './AiManufacturingTools';
import CollectionWorkshopTools from './CollectionWorkshopTools';
import MeasurementPanel from './MeasurementPanel';
import PresetControls from './PresetControls';

export default function StyleVariantTools(){
  const store=useEditorStore();
  const{assetId,manifest,selected,configuration,setVariants,setMaterials,materials,variants,dispatch,applyRules}=store;
  const[styles,setStyles]=useState<StyleRecord[]>([]);
  const[colors,setColors]=useState<ColorPreset[]>([]);
  const definition=manifest?.components.find(c=>c.id===selected),state=selected?configuration?.components[selected]:undefined;

  useEffect(()=>{
    let cancelled=false;
    void Promise.all([getStyles(),getMaterials(),getColors()]).then(([styleRows,materialRows,colorRows])=>{
      if(cancelled)return;
      setStyles(styleRows);setMaterials(materialRows);setColors(colorRows);
      const current=useEditorStore.getState().configuration;
      if(current)useEditorStore.setState({configuration:structuredClone(current)});
    }).catch(error=>{if(!cancelled)useEditorStore.setState({error:error instanceof Error?error.message:'Could not load surface catalogs.'});});
    return()=>{cancelled=true;};
  },[setMaterials]);

  useEffect(()=>{if(!definition)return;let cancelled=false;void getVariants(definition.variantGroupId,definition.role).then(items=>{if(!cancelled)setVariants(items);}).catch(e=>{if(!cancelled)useEditorStore.setState({error:e instanceof Error?e.message:'Could not load variants.'});});return()=>{cancelled=true;};},[assetId,definition?.id,definition?.variantGroupId,definition?.role,setVariants]);

  const list=definition&&manifest?Object.values(variants).filter(v=>canApplyVariant(definition,v,manifest.modelTags??[],manifest.anchors??[])):[];
  const currentMaterial=state?.materialId?materials.find(item=>item.id===state.materialId):undefined;
  const colorOptions=definition?colors.filter(color=>{
    if(!color.compatibleMaterialCategories.length)return true;
    if(currentMaterial)return color.compatibleMaterialCategories.includes(currentMaterial.category);
    if(!definition.allowedMaterialCategories?.length)return true;
    return definition.allowedMaterialCategories.some(category=>color.compatibleMaterialCategories.includes(category));
  }):[];

  return <>
    <MeasurementPanel/>
    <div className="field-group">
      <div className="eyebrow">Style & Variant</div>
      <label>Style</label>
      <select defaultValue="" onChange={e=>{const style=styles.find(s=>s.id===e.target.value);if(style)applyRules(style.rulesJson,'STYLE',`Apply style ${style.name}`,style.id);}}><option value="">Choose style…</option>{styles.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
      {definition&&state&&<>
        <label>Variant</label>
        <select value={state.variantId??''} disabled={!definition.variantGroupId} onChange={e=>{if(!e.target.value)dispatch({type:'RESET_COMPONENT',componentId:definition.id,source:'MANUAL'},'Reset component to original');else dispatch({type:'REPLACE_COMPONENT',componentId:definition.id,variantId:e.target.value,source:'MANUAL'},'Replace component variant');}}><option value="">Original component (reset)</option>{list.map((v:RuntimeVariant)=><option key={v.id} value={v.id}>{v.name} · {v.dimensionPolicy} · {v.anchorType}</option>)}</select>
        {definition.variantGroupId&&list.length===0?<p className="hint">No compatible variants for the current model tags, component role and semantic anchors.</p>:null}
      </>}
    </div>

    {definition&&state&&<div className="field-group" data-testid="color-preset-library">
      <div className="eyebrow">Color Presets</div>
      <p className="hint">Preset màu đến từ catalog database và có style tags/compatibility metadata. Chọn preset chỉ đặt màu hiện tại; bạn vẫn có thể chỉnh hex thủ công ở Màu sắc & Vật liệu.</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:6}}>
        {colorOptions.map(color=><button
          type="button"
          key={color.id}
          disabled={!definition.editable}
          title={`${color.name} · ${color.styleTags.join(', ')||'no style tags'}`}
          onClick={()=>dispatch({type:'SET_COLOR',componentId:definition.id,color:color.hex,source:'MANUAL'},`Apply color preset ${color.name}`)}
          style={{display:'flex',alignItems:'center',gap:7,textAlign:'left'}}
        ><span aria-hidden style={{width:18,height:18,borderRadius:4,background:color.hex,border:'1px solid rgba(255,255,255,.35)',flex:'0 0 auto'}}/><span>{color.name}</span></button>)}
      </div>
      {!colorOptions.length?<p className="hint">No compatible color presets for the current material/component categories.</p>:null}
    </div>}

    <PresetControls/>
    <AiManufacturingTools/>
    <CollectionWorkshopTools/>
  </>;
}
