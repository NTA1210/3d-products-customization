import {expect,test} from '@playwright/test';
import path from 'node:path';

const now=new Date().toISOString();
const authUser={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'e2e@example.com',email_confirmed_at:now,phone:'',confirmed_at:now,last_sign_in_at:now,app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[],created_at:now,updated_at:now,is_anonymous:false};
const session={access_token:'e2e-access-token',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'e2e-refresh-token',user:authUser};
const analysis={version:1 as const,unitScaleToMm:1000,stats:{nodes:8,meshes:6,primitives:6,triangles:72,materials:1,textures:0},meshes:[],componentCandidates:[],warnings:[]};

async function json(route:Parameters<Parameters<typeof test>[1]>[0]['page']['route'] extends never?never:never){void route;}

test('Import → prepare → lock → customize → undo/redo → save version → export GLB',async({page})=>{
  let versionPosts=0;
  let exportQueued=false;
  let artifactRequested=false;

  await page.route('http://127.0.0.1:54321/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/auth/v1/token')){
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(session)});
      return;
    }
    if(url.pathname.startsWith('/storage/v1/')){
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({Key:'assets/asset-e2e/source/proper-components.glb',path:'assets/asset-e2e/source/proper-components.glb'})});
      return;
    }
    await route.fulfill({status:200,contentType:'application/json',body:'{}'});
  });

  await page.route('http://127.0.0.1:4000/api/**',async route=>{
    const request=route.request();
    const url=new URL(request.url());
    const pathname=url.pathname;
    const method=request.method();
    const fulfill=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});

    if(pathname==='/api/projects'&&method==='GET')return fulfill([]);
    if(pathname==='/api/assets/import'&&method==='POST')return fulfill({asset:{id:'asset-e2e'},upload:{bucket:'product3d',path:'assets/asset-e2e/source/proper-components.glb',token:'signed-upload-token',expiresInSeconds:7200}});
    if(pathname==='/api/assets/asset-e2e/analyze'&&method==='POST')return fulfill({jobId:'asset-job'});
    if(pathname==='/api/jobs/asset-job'&&method==='GET')return fulfill({id:'asset-job',status:'COMPLETED'});
    if(pathname==='/api/assets/asset-e2e/analysis'&&method==='GET')return fulfill(analysis);
    if(pathname==='/api/assets/asset-e2e/manifest'&&method==='PUT')return fulfill({id:'manifest-e2e',version:1,manifestJson:(await request.postDataJSON()).manifestJson});
    if(pathname==='/api/projects'&&method==='POST')return fulfill({id:'project-e2e',name:'proper-components'});
    if(pathname==='/api/projects/project-e2e/versions'&&method==='POST'){
      versionPosts+=1;
      return fulfill({id:`version-${versionPosts}`,name:`Version ${versionPosts}`,configurationJson:(await request.postDataJSON()).configurationJson,createdAt:now});
    }
    if(pathname==='/api/projects/project-e2e/export'&&method==='POST'){
      exportQueued=true;
      return fulfill({jobId:'export-job',format:'GLB'});
    }
    if(pathname==='/api/jobs/export-job'&&method==='GET')return fulfill({id:'export-job',status:'COMPLETED'});
    if(pathname==='/api/jobs/export-job/artifact'&&method==='GET'){
      artifactRequested=true;
      return fulfill({url:'data:model/gltf-binary;base64,Z2xURg==',filename:'customized.glb'});
    }
    return fulfill({message:`Unhandled E2E route ${method} ${pathname}`},404);
  });

  await page.goto('/');
  await page.getByLabel('Email').fill('e2e@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page.getByText('e2e@example.com')).toBeVisible();

  const glbInput=page.locator('input[type="file"][accept=".glb"]');
  await glbInput.setInputFiles(path.resolve('examples/fixtures/proper-components.glb'));
  await expect(page.getByText('Asset Preparation')).toBeVisible();
  await expect(page.locator('.component-card').first()).toBeVisible();

  await page.getByLabel('Editable').check();
  await page.getByLabel('Scaling').selectOption('AXIS_SCALE');
  await page.getByLabel('X').first().check();
  await page.getByRole('button',{name:'Save Manifest & Open Editor'}).click();

  await expect(page.getByRole('button',{name:'Lock placement'})).toBeVisible();
  await page.getByRole('button',{name:'Lock placement'}).click();
  const width=page.getByLabel('WIDTH (mm)');
  await expect(width).toBeEnabled();
  const initialWidth=await width.inputValue();
  const changedWidth=String(Math.max(1,Math.round(Number(initialWidth)*0.9)));
  await width.fill(changedWidth);
  await expect(width).toHaveValue(changedWidth);

  const material=page.getByLabel('Material');
  await material.selectOption('mat_oak_light');
  await expect(material).toHaveValue('mat_oak_light');
  await page.getByRole('button',{name:'Undo'}).click();
  await expect(material).toHaveValue('');
  await page.getByRole('button',{name:'Redo'}).click();
  await expect(material).toHaveValue('mat_oak_light');

  await page.getByRole('button',{name:'Create Project'}).click();
  await expect.poll(()=>versionPosts).toBe(1);
  await page.getByRole('button',{name:'Save Version'}).click();
  await expect.poll(()=>versionPosts).toBe(2);
  await page.getByRole('button',{name:'Export GLB'}).click();
  await expect.poll(()=>exportQueued).toBe(true);
  await expect.poll(()=>artifactRequested,{timeout:10_000}).toBe(true);
});
