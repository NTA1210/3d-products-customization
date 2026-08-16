import {authFetch} from './supabase-browser';

const apiRoot=()=>`${(process.env.NEXT_PUBLIC_API_URL??'http://localhost:4000').replace(/\/$/,'')}/api`;

export async function reportViewerLoad(valueMs:number){
  if(!Number.isFinite(valueMs)||valueMs<=0)return;
  try{
    await authFetch(`${apiRoot()}/metrics/client`,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({name:'viewer_load_time',valueMs}),
    });
  }catch{
    // Telemetry must never block or fail the editor experience.
  }
}
