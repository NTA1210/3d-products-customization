'use client';
import {useState} from 'react';
import {createMultiViewRender,requestDesignSuggestions,runManufacturingCheck,type AiDesignResult,type ManufacturingIssue} from '../lib/ai-manufacturing-api';
import {useEditorStore} from '../lib/store';

export default function AiManufacturingTools(){
  const store=useEditorStore();
  const[instructions,setInstructions]=useState('');
  const[ai,setAi]=useState<AiDesignResult>();
  const[issues,setIssues]=useState<ManufacturingIssue[]>([]);
  const[busy,setBusy]=useState<'ai'|'manufacturing'>();
  const ready=Boolean(store.projectId&&store.configuration?.placement.locked);

  const suggest=async()=>{
    if(!store.projectId||!store.configuration)return;
    setBusy('ai');
    try{
      const renderJobId=await createMultiViewRender(store.projectId,store.configuration);
      setAi(await requestDesignSuggestions(store.projectId,store.configuration,renderJobId,instructions));
    }catch(error){useEditorStore.setState({error:error instanceof Error?error.message:'AI suggestion failed.'});}
    finally{setBusy(undefined);}
  };
  const check=async()=>{
    if(!store.projectId||!store.configuration)return;
    setBusy('manufacturing');
    try{setIssues((await runManufacturingCheck(store.projectId,store.configuration)).issues);}
    catch(error){useEditorStore.setState({error:error instanceof Error?error.message:'Manufacturing check failed.'});}
    finally{setBusy(undefined);}
  };

  return <div className="field-group">
    <div className="eyebrow">AI & Manufacturing</div>
    <textarea rows={3} placeholder="Design goals / customer standards…" value={instructions} onChange={e=>setInstructions(e.target.value)}/>
    <div className="row">
      <button disabled={!ready||Boolean(busy)} onClick={()=>void suggest()}>{busy==='ai'?'Rendering + analyzing…':'AI Suggest'}</button>
      <button disabled={!ready||Boolean(busy)} onClick={()=>void check()}>{busy==='manufacturing'?'Checking…':'Manufacturing Check'}</button>
    </div>
    {!store.projectId&&<p className="hint">Create a project before AI/manufacturing tools.</p>}
    {ai&&<div><p className="hint">{ai.summary}</p>{ai.suggestions.map(s=><div className={`warning ${s.valid?'':'error'}`} key={s.id}><strong>{s.title}</strong><p>{s.reason}</p>{!s.valid&&<small>{s.validationErrors.join(' · ')}</small>}<button disabled={!s.valid} onClick={()=>store.dispatchBatch(s.actions,`AI: ${s.title}`)}>Apply suggestion</button></div>)}</div>}
    {issues.length===0&&busy!=='manufacturing'&&<p className="hint">No manufacturing issues loaded.</p>}
    {issues.map(issue=><div className={issue.severity==='ERROR'?'error':'warning'} key={issue.id}><strong>{issue.severity}</strong> · {issue.message}<div className="source-id">{issue.componentIds.join(', ')}</div>{issue.suggestedActions?.length?<button onClick={()=>store.dispatchBatch(issue.suggestedActions!,`Manufacturing fix: ${issue.ruleId}`)}>Apply suggested fix</button>:null}</div>)}
  </div>;
}
