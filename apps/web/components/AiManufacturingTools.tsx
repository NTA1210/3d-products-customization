'use client';
import {useEffect,useState} from 'react';
import {createLifestyleVisualization,createMultiViewRender,requestDesignSuggestions,runGeometryManufacturingCheck,runManufacturingCheck,type AiDesignResult,type ManufacturingIssue} from '../lib/ai-manufacturing-api';
import {useEditorStore} from '../lib/store';

type Busy='ai'|'visualization'|'manufacturing'|'geometry';

export default function AiManufacturingTools(){
  const store=useEditorStore();
  const[instructions,setInstructions]=useState('');
  const[ai,setAi]=useState<AiDesignResult>();
  const[issues,setIssues]=useState<ManufacturingIssue[]>([]);
  const[geometry,setGeometry]=useState<Record<string,unknown>>();
  const[visualizationUrl,setVisualizationUrl]=useState<string>();
  const[busy,setBusy]=useState<Busy>();
  const ready=Boolean(store.projectId&&store.configuration?.placement.locked);

  useEffect(()=>{
    setInstructions('');
    setAi(undefined);
    setIssues([]);
    setGeometry(undefined);
    setVisualizationUrl(undefined);
    setBusy(undefined);
  },[store.assetId,store.projectId]);

  const fail=(error:unknown,fallback:string)=>useEditorStore.setState({error:error instanceof Error?error.message:fallback});
  const suggest=async()=>{
    if(!store.projectId||!store.configuration)return;
    setBusy('ai');
    try{const renderJobId=await createMultiViewRender(store.projectId,store.configuration);setAi(await requestDesignSuggestions(store.projectId,store.configuration,renderJobId,instructions));}
    catch(error){fail(error,'AI suggestion failed.');}finally{setBusy(undefined);}
  };
  const visualize=async()=>{
    if(!store.projectId||!store.configuration||!instructions.trim())return;
    setBusy('visualization');
    try{const result=await createLifestyleVisualization(store.projectId,store.configuration,instructions.trim());setVisualizationUrl(result.url);}
    catch(error){fail(error,'AI visualization failed.');}finally{setBusy(undefined);}
  };
  const check=async()=>{
    if(!store.projectId||!store.configuration)return;
    setBusy('manufacturing');
    try{setIssues((await runManufacturingCheck(store.projectId,store.configuration)).issues);setGeometry(undefined);}
    catch(error){fail(error,'Manufacturing check failed.');}finally{setBusy(undefined);}
  };
  const geometryCheck=async()=>{
    if(!store.projectId||!store.configuration)return;
    setBusy('geometry');
    try{const result=await runGeometryManufacturingCheck(store.projectId,store.configuration);setIssues(result.issues);setGeometry(result.geometryJson??undefined);}
    catch(error){fail(error,'Geometry manufacturing check failed.');}finally{setBusy(undefined);}
  };

  return <div className="field-group">
    <div className="eyebrow">AI & Manufacturing</div>
    <textarea rows={3} placeholder="Design goals or lifestyle visualization instructions…" value={instructions} onChange={e=>setInstructions(e.target.value)}/>
    <div className="row">
      <button disabled={!ready||Boolean(busy)} onClick={()=>void suggest()}>{busy==='ai'?'Rendering + analyzing…':'AI Suggest'}</button>
      <button disabled={!ready||Boolean(busy)||!instructions.trim()} onClick={()=>void visualize()}>{busy==='visualization'?'Generating…':'Lifestyle Visual'}</button>
    </div>
    <div className="row">
      <button disabled={!ready||Boolean(busy)} onClick={()=>void check()}>{busy==='manufacturing'?'Checking…':'Rule Check'}</button>
      <button disabled={!ready||Boolean(busy)} onClick={()=>void geometryCheck()}>{busy==='geometry'?'Exporting + analyzing…':'Geometry Check'}</button>
    </div>
    {!store.projectId&&<p className="hint">Create a project before AI/manufacturing tools.</p>}
    {visualizationUrl&&<div><img src={visualizationUrl} alt="AI lifestyle visualization" style={{width:'100%',height:'auto',borderRadius:8}}/><a href={visualizationUrl} target="_blank" rel="noreferrer">Open visualization</a></div>}
    {ai&&<div><p className="hint">{ai.summary}</p>{ai.suggestions.map(s=><div className={`warning ${s.valid?'':'error'}`} key={s.id}><strong>{s.title}</strong><p>{s.reason}</p>{!s.valid&&<small>{s.validationErrors.join(' · ')}</small>}<button disabled={!s.valid} onClick={()=>store.dispatchBatch(s.actions,`AI: ${s.title}`)}>Apply suggestion</button></div>)}</div>}
    {geometry&&<div className="warning"><strong>Geometry facts</strong><pre className="source-id" style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(geometry,null,2)}</pre></div>}
    {issues.length===0&&!busy&&<p className="hint">No manufacturing issues loaded.</p>}
    {issues.map(issue=><div className={issue.severity==='ERROR'?'error':'warning'} key={issue.id}><strong>{issue.severity}</strong> · {issue.message}<div className="source-id">{issue.componentIds.join(', ')}</div>{issue.suggestedActions?.length?<button onClick={()=>store.dispatchBatch(issue.suggestedActions!,`Manufacturing fix: ${issue.ruleId}`)}>Apply suggested fix</button>:null}</div>)}
  </div>;
}
