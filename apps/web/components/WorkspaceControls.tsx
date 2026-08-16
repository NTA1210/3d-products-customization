'use client';
import {useEffect,useState} from 'react';
import {listAssets,loadStoredAsset,type AssetSummary} from '../lib/asset-api';
import {useAuthStore} from '../lib/auth-store';
import {createProject,exportAndDownload,listProjects,loadProject,saveVersion,type ExportFormat,type ProjectSummary,type ProjectVersion} from '../lib/project-api';
import {useEditorStore} from '../lib/store';

export default function WorkspaceControls(){
  const user=useAuthStore(s=>s.user),store=useEditorStore();
  const[assets,setAssets]=useState<AssetSummary[]>([]),[projects,setProjects]=useState<ProjectSummary[]>([]),[versions,setVersions]=useState<ProjectVersion[]>([]),[busy,setBusy]=useState(false),[exportFormat,setExportFormat]=useState<ExportFormat>('GLB');
  const refresh=async()=>{
    if(!user){setAssets([]);setProjects([]);return;}
    try{
      const[assetRows,projectRows]=await Promise.all([listAssets(),listProjects()]);
      setAssets(assetRows);setProjects(projectRows);
    }catch(e){useEditorStore.setState({error:e instanceof Error?e.message:'Could not load workspace.'});}
  };
  useEffect(()=>{void refresh();},[user?.id,store.assetId]);
  const create=async()=>{if(!store.assetId||!store.configuration)return;setBusy(true);try{const project=await createProject(store.assetId,store.assetName?.replace(/\.glb$/i,'')||'3D Project');await saveVersion(project.id,'Initial',store.configuration);store.setProjectId(project.id);await refresh();}catch(e){useEditorStore.setState({error:e instanceof Error?e.message:'Could not create project.'});}finally{setBusy(false);}};
  const save=async()=>{if(!store.projectId||!store.configuration)return;setBusy(true);try{await saveVersion(store.projectId,`Version ${new Date().toLocaleString()}`,store.configuration);await refresh();}catch(e){useEditorStore.setState({error:e instanceof Error?e.message:'Could not save version.'});}finally{setBusy(false);}};
  const openProject=async(id:string,versionId?:string)=>{if(!id)return;setBusy(true);try{const loaded=await loadProject(id,versionId);if(store.assetUrl?.startsWith('blob:'))URL.revokeObjectURL(store.assetUrl);store.hydrateProject(loaded);setVersions(loaded.versions);}catch(e){useEditorStore.setState({error:e instanceof Error?e.message:'Could not load project.'});}finally{setBusy(false);}};
  const openAsset=async(id:string)=>{if(!id||id===store.assetId&&!store.projectId)return;setBusy(true);try{const loaded=await loadStoredAsset(id);if(store.assetUrl?.startsWith('blob:'))URL.revokeObjectURL(store.assetUrl);store.hydrateAsset(loaded);setVersions([]);}catch(e){useEditorStore.setState({error:e instanceof Error?e.message:'Could not load model from library.'});}finally{setBusy(false);}};
  const download=async()=>{if(!store.projectId||!store.configuration)return;setBusy(true);try{await exportAndDownload(store.projectId,store.configuration,exportFormat);}catch(e){useEditorStore.setState({error:e instanceof Error?e.message:'Export failed.'});}finally{setBusy(false);}};
  if(!user)return <span className="muted">Sign in to save projects.</span>;
  return <div className="row">
    <select aria-label="My Models" disabled={busy} value={store.projectId?'':store.assetId??''} onChange={e=>void openAsset(e.target.value)}>
      <option value="">My Models…</option>
      {assets.map(asset=><option key={asset.id} value={asset.id} disabled={asset.status!=='READY'}>{asset.name} · {asset.status}{asset._count.manifests?` · manifest v${asset._count.manifests}`:''}</option>)}
    </select>
    <select aria-label="Projects" value={store.projectId??''} onChange={e=>void openProject(e.target.value)}><option value="">Projects…</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
    {versions.length>0&&<select aria-label="Versions" defaultValue="" onChange={e=>store.projectId&&void openProject(store.projectId,e.target.value)}><option value="">Versions…</option>{versions.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select>}
    <button disabled={busy||!store.assetId||!store.configuration||Boolean(store.projectId)} onClick={()=>void create()}>Create Project</button>
    <button disabled={busy||!store.projectId||!store.configuration} onClick={()=>void save()}>Save Version</button>
    <select aria-label="Export format" value={exportFormat} onChange={e=>setExportFormat(e.target.value as ExportFormat)}><option value="GLB">GLB</option><option value="OBJ">OBJ (mm)</option><option value="STL">STL (mm)</option></select>
    <button disabled={busy||!store.projectId||!store.configuration} onClick={()=>void download()}>{busy?'Working…':`Export ${exportFormat}`}</button>
  </div>;
}