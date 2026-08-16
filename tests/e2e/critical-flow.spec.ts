import {expect,test} from '@playwright/test';
import path from 'node:path';

const now=new Date().toISOString();
const authUser={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'e2e@example.com',email_confirmed_at:now,phone:'',confirmed_at:now,last_sign_in_at:now,app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[],created_at:now,updated_at:now,is_anonymous:false};
const session={access_token:'e2e-access-token',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'e2e-refresh-token',user:authUser};
const analysis={version:1 as const,unitScaleToMm:1000,stats:{nodes:8,meshes:6,primitives:6,triangles:72,materials:1,textures:0},meshes:[],componentCandidates:[],warnings:[{code:'ROOT_SCALE_NON_IDENTITY',severity:'INFO' as const,message:'Root scale review note.',sourceId:'node_0000'},{code:'DUPLICATE_NAME',severity:'INFO' as const,message:'Duplicate display-name note.'}]};

async function mockAuth(page:Parameters<typeof test>[0] extends never?never:any){
  await page.route('http://127.0.0.1:54321/**',async (route:any)=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/auth/v1/token')){
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(session)});
      return;
    }
    if(url.pathname.startsWith('/storage/v1/')){
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({Key:'assets/asset-e2e/source/model.glb',path:'assets/asset-e2e/source/model.glb'})});
      return;
    }
    await route.fulfill({status:200,contentType:'application/json',body:'{}'});
  });
}

async function signIn(page:any){
  await page.goto('/');
  await page.getByLabel('Email').fill('e2e@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button',{name:'Đăng nhập'}).click();
  await expect(page.getByText('e2e@example.com')).toBeVisible();
}

test('Import → prepare → select on model → lock → customize → undo/redo → save version → export GLB',async({page})=>{
  let versionPosts=0;
  let exportQueued=false;
  let artifactRequested=false;

  await mockAuth(page);
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
  await page.getByRole('button',{name:'Đăng ký'}).click();
  await expect(page.getByText('Nhập email.')).toBeVisible();
  await page.getByLabel('Email').fill('e2e@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button',{name:'Đăng nhập'}).click();
  await expect(page.getByText('e2e@example.com')).toBeVisible();

  const glbInput=page.locator('input[type="file"][accept=".glb"]');
  await glbInput.setInputFiles(path.resolve('examples/fixtures/proper-components.glb'));
  await expect(page.getByText('Asset Preparation')).toBeVisible();
  await expect(page.locator('.component-card').first()).toBeVisible();

  const firstComponentName=(await page.locator('.component-card').first().locator('span').innerText()).trim();
  await expect(page.locator('.viewer').getByText(firstComponentName,{exact:true})).toBeVisible();
  const secondComponent=page.locator('.component-card').nth(1);
  const secondComponentName=(await secondComponent.locator('span').innerText()).trim();
  await secondComponent.click();
  await expect(page.locator('.viewer').getByText(secondComponentName,{exact:true})).toBeVisible();
  await page.locator('.component-card').first().click();
  await expect(page.locator('.viewer').getByText(firstComponentName,{exact:true})).toBeVisible();

  await expect(page.getByText(/2 non-blocking model note\(s\) hidden/)).toBeVisible();
  await expect(page.getByText('Root scale review note.')).toHaveCount(0);
  await expect(page.getByText('Duplicate display-name note.')).toHaveCount(0);

  await page.getByLabel('Editable').check();
  await page.locator('label:has-text("Scaling") + select').selectOption('AXIS_SCALE');
  await page.locator('label.check.inline').filter({hasText:/^X$/}).locator('input[type="checkbox"]').check();
  await page.getByRole('button',{name:'Save Manifest & Open Editor'}).click();

  await expect(page.getByRole('button',{name:'Lock placement'})).toBeVisible();
  await page.getByRole('button',{name:'Lock placement'}).click();
  await expect(page.getByRole('button',{name:'Move'}).last()).toBeEnabled();
  await expect(page.getByRole('button',{name:'Resize'})).toBeEnabled();
  const width=page.locator('label:has-text("WIDTH (mm)")').locator('..').locator('input[type="number"]');
  await expect(width).toBeEnabled();
  const initialWidth=await width.inputValue();
  const changedWidth=String(Math.max(1,Math.round(Number(initialWidth)*0.9)));
  await width.fill(changedWidth);
  await expect(width).toHaveValue(changedWidth);
  await expect(page.getByLabel('WIDTH slider')).toBeEnabled();

  const material=page.locator('label:has-text("Material") + select');
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

test('single-mesh disconnected geometry becomes separate preparation components',async({page})=>{
  const regionAnalysis={
    version:1 as const,
    unitScaleToMm:1000,
    stats:{nodes:1,meshes:1,primitives:1,triangles:24,materials:1,textures:0},
    meshes:[],
    componentCandidates:[],
    warnings:[
      {code:'ONE_MESH_ONLY',severity:'WARNING' as const,message:'This asset contains only one source mesh.'},
      {code:'DISCONNECTED_GEOMETRY_ISLANDS',severity:'INFO' as const,message:'The source mesh contains 2 disconnected geometry islands.'},
    ],
  };

  await mockAuth(page);
  await page.route('http://127.0.0.1:4000/api/**',async route=>{
    const request=route.request();
    const url=new URL(request.url());
    const pathname=url.pathname;
    const method=request.method();
    const fulfill=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(pathname==='/api/projects'&&method==='GET')return fulfill([]);
    if(pathname==='/api/assets/import'&&method==='POST')return fulfill({asset:{id:'region-asset'},upload:{bucket:'product3d',path:'assets/region-asset/source/disconnected-islands.glb',token:'signed-upload-token',expiresInSeconds:7200}});
    if(pathname==='/api/assets/region-asset/analyze'&&method==='POST')return fulfill({jobId:'region-job'});
    if(pathname==='/api/jobs/region-job'&&method==='GET')return fulfill({id:'region-job',status:'COMPLETED'});
    if(pathname==='/api/assets/region-asset/analysis'&&method==='GET')return fulfill(regionAnalysis);
    if(pathname==='/api/assets/region-asset/manifest'&&method==='PUT')return fulfill({id:'region-manifest',version:1,manifestJson:(await request.postDataJSON()).manifestJson});
    return fulfill({message:`Unhandled E2E route ${method} ${pathname}`},404);
  });

  await signIn(page);
  await page.locator('input[type="file"][accept=".glb"]').setInputFiles(path.resolve('examples/fixtures/disconnected-islands.glb'));
  await expect(page.getByText('Asset Preparation')).toBeVisible();
  await expect(page.locator('.component-card')).toHaveCount(2);
  await expect(page.getByText(/Single-mesh asset đã được tách thành 2 geometry region candidate/)).toBeVisible();
  await expect(page.locator('.component-card').first()).toContainText('geometry region');
  await expect(page.locator('.source-id')).toContainText('_island_000');

  await page.getByLabel('Editable').check();
  await page.locator('label:has-text("Scaling") + select').selectOption('AXIS_SCALE');
  await page.locator('label.check.inline').filter({hasText:/^X$/}).locator('input[type="checkbox"]').check();
  await page.getByRole('button',{name:'Save Manifest & Open Editor'}).click();
  await page.getByRole('button',{name:'Lock placement'}).click();
  await expect(page.getByRole('button',{name:'Move'}).last()).toBeEnabled();
  await expect(page.getByRole('button',{name:'Rotate'}).last()).toBeEnabled();
  await expect(page.getByRole('button',{name:'Resize'})).toBeEnabled();
  await expect(page.getByLabel('WIDTH slider')).toBeEnabled();
});
