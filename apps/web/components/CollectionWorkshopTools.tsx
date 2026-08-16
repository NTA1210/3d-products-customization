'use client';
import {useEffect,useMemo,useState} from 'react';
import {listRfq,listWorkshops,prepareAndSubmitRfq,recommendCollection,type CollectionRecommendation,type RfqResult,type Workshop} from '../lib/collection-rfq-api';
import {useEditorStore} from '../lib/store';

function tags(value:string){return value.split(',').map(item=>item.trim()).filter(Boolean);}

export default function CollectionWorkshopTools(){
  const store=useEditorStore();
  const[category,setCategory]=useState('CUSTOM');
  const[colorFamily,setColorFamily]=useState('');
  const[styleTags,setStyleTags]=useState('');
  const[materialTags,setMaterialTags]=useState('');
  const[featureTags,setFeatureTags]=useState('');
  const[recommendations,setRecommendations]=useState<CollectionRecommendation[]>([]);
  const[workshops,setWorkshops]=useState<Workshop[]>([]);
  const[workshopId,setWorkshopId]=useState('');
  const[note,setNote]=useState('');
  const[rfqs,setRfqs]=useState<RfqResult[]>([]);
  const[busy,setBusy]=useState<'collection'|'rfq'>();
  const ready=Boolean(store.projectId&&store.configuration?.placement.locked);
  const error=(value:unknown,fallback:string)=>useEditorStore.setState({error:value instanceof Error?value.message:fallback});

  useEffect(()=>{void listWorkshops().then(rows=>{setWorkshops(rows);setWorkshopId(current=>current||rows[0]?.id||'');}).catch(value=>error(value,'Could not load workshops.'));},[]);
  useEffect(()=>{
    setCategory('CUSTOM');
    setColorFamily('');
    setStyleTags('');
    setMaterialTags('');
    setFeatureTags('');
    setRecommendations([]);
    setNote('');
    setRfqs([]);
    setBusy(undefined);
  },[store.assetId,store.projectId]);
  useEffect(()=>{if(!store.projectId)return;let cancelled=false;void listRfq(store.projectId).then(rows=>{if(!cancelled)setRfqs(rows);}).catch(()=>undefined);return()=>{cancelled=true;};},[store.projectId]);

  const recommend=async()=>{
    if(!store.projectId||!store.configuration)return;setBusy('collection');
    try{const result=await recommendCollection(store.projectId,store.configuration,{category,colorFamily:colorFamily||undefined,styleTags:tags(styleTags),materialTags:tags(materialTags),componentFeatures:tags(featureTags)});setRecommendations(result.recommendations);}
    catch(value){error(value,'Collection recommendation failed.');}finally{setBusy(undefined);}
  };
  const submit=async()=>{
    if(!store.projectId||!store.configuration||!workshopId)return;setBusy('rfq');
    try{const result=await prepareAndSubmitRfq(store.projectId,store.configuration,workshopId,note);setRfqs(current=>[result,...current.filter(item=>item.id!==result.id)]);}
    catch(value){error(value,'RFQ submission failed.');}finally{setBusy(undefined);}
  };
  const workshop=useMemo(()=>workshops.find(item=>item.id===workshopId),[workshops,workshopId]);

  return <div className="field-group">
    <div className="eyebrow">Collection & Workshop</div>
    <label>Product category</label><input value={category} onChange={e=>setCategory(e.target.value)}/>
    <label>Color family</label><input placeholder="natural, black, brown…" value={colorFamily} onChange={e=>setColorFamily(e.target.value)}/>
    <label>Style tags</label><input placeholder="scandinavian, light" value={styleTags} onChange={e=>setStyleTags(e.target.value)}/>
    <label>Material tags</label><input placeholder="wood, oak" value={materialTags} onChange={e=>setMaterialTags(e.target.value)}/>
    <label>Component features</label><input placeholder="top, leg, storage" value={featureTags} onChange={e=>setFeatureTags(e.target.value)}/>
    <button disabled={!ready||Boolean(busy)} onClick={()=>void recommend()}>{busy==='collection'?'Ranking…':'Recommend Collection'}</button>
    {recommendations.map(item=><div className="warning" key={item.product.id}><strong>{item.product.name}</strong> · {Math.round(item.score*100)}%<div className="source-id">Style {Math.round(item.breakdown.style*100)} · Material {Math.round(item.breakdown.material*100)} · Color {Math.round(item.breakdown.color*100)} · Other {Math.round(item.breakdown.other*100)}</div></div>)}

    <label>Workshop</label><select value={workshopId} onChange={e=>setWorkshopId(e.target.value)}><option value="">Choose workshop…</option>{workshops.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
    {workshop&&<p className="hint">Capabilities: {JSON.stringify(workshop.capabilitiesJson)}</p>}
    <label>Customer note</label><textarea rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Manufacturing / finish / delivery notes…"/>
    <button className="primary" disabled={!ready||!workshopId||Boolean(busy)} onClick={()=>void submit()}>{busy==='rfq'?'Saving + exporting…':'Create & Submit RFQ'}</button>
    {!store.projectId&&<p className="hint">Create or load a project before Collection/RFQ.</p>}
    {rfqs.slice(0,4).map(rfq=><div className="warning" key={rfq.id}><strong>RFQ {rfq.status}</strong> · {rfq.workshop.name}<div className="row">{rfq.payload.exportAssetUrl&&<a href={rfq.payload.exportAssetUrl} target="_blank" rel="noreferrer">Export GLB</a>}{rfq.payload.previewImages?.[0]&&<a href={rfq.payload.previewImages[0]} target="_blank" rel="noreferrer">Preview</a>}</div></div>)}
  </div>;
}
