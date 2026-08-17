import {expect,test,type Page} from '@playwright/test';
import path from 'node:path';

const now=new Date().toISOString();
const authUser={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'shortcuts@example.com',email_confirmed_at:now,phone:'',confirmed_at:now,last_sign_in_at:now,app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[],created_at:now,updated_at:now,is_anonymous:false};
const session={access_token:'e2e-access-token',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'e2e-refresh-token',user:authUser};
const analysis={version:1 as const,unitScaleToMm:1000,stats:{nodes:8,meshes:6,primitives:6,triangles:72,materials:1,textures:0},meshes:[],componentCandidates:[],warnings:[]};

async function mockAuth(page:Page){
  await page.route('http://127.0.0.1:54321/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/auth/v1/token'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(session)});
    if(url.pathname.startsWith('/storage/v1/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({Key:'assets/shortcut-asset/source/model.glb',path:'assets/shortcut-asset/source/model.glb'})});
    return route.fulfill({status:200,contentType:'application/json',body:'{}'});
  });
}

async function signIn(page:Page){
  await page.goto('/');
  await page.getByLabel('Email').fill('shortcuts@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button',{name:'Đăng nhập'}).click();
  await expect(page.getByText('shortcuts@example.com')).toBeVisible();
}

test('component labels and keyboard shortcuts are user configurable',async({page})=>{
  await mockAuth(page);
  await page.route('http://127.0.0.1:4000/api/**',async route=>{
    const request=route.request();
    const url=new URL(request.url());
    const pathname=url.pathname;
    const method=request.method();
    const fulfill=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(pathname==='/api/assets'&&method==='GET')return fulfill([]);
    if(pathname==='/api/projects'&&method==='GET')return fulfill([]);
    if(pathname==='/api/assets/import'&&method==='POST')return fulfill({asset:{id:'shortcut-asset'},upload:{bucket:'product3d',path:'assets/shortcut-asset/source/proper-components.glb',token:'signed-upload-token',expiresInSeconds:7200}});
    if(pathname==='/api/assets/shortcut-asset/analyze'&&method==='POST')return fulfill({jobId:'shortcut-job'});
    if(pathname==='/api/jobs/shortcut-job'&&method==='GET')return fulfill({id:'shortcut-job',status:'COMPLETED'});
    if(pathname==='/api/assets/shortcut-asset/analysis'&&method==='GET')return fulfill(analysis);
    if(pathname==='/api/assets/shortcut-asset/manifest'&&method==='PUT')return fulfill({id:'shortcut-manifest',version:1,manifestJson:(await request.postDataJSON()).manifestJson});
    return fulfill({message:`Unhandled E2E route ${method} ${pathname}`},404);
  });

  await signIn(page);
  await page.locator('input[type="file"][accept=".glb"]').setInputFiles(path.resolve('examples/fixtures/proper-components.glb'));
  await expect(page.getByText('Asset Preparation')).toBeVisible();

  const labelMode=page.getByLabel('Component label display');
  await expect(labelMode).toHaveValue('selected');
  const firstName=(await page.locator('.component-card').first().locator('span').innerText()).trim();
  await expect(page.locator('.viewer').getByText(firstName,{exact:true})).toBeVisible();

  await page.keyboard.press('l');
  await expect(labelMode).toHaveValue('off');
  await page.keyboard.press('l');
  await expect(labelMode).toHaveValue('selected');

  await labelMode.selectOption('all');
  await expect(labelMode).toHaveValue('all');
  await expect(page.getByTestId('component-label').first()).toBeVisible();

  await page.getByRole('button',{name:'Keyboard shortcut settings'}).click();
  await expect(page.getByTestId('shortcut-settings')).toBeVisible();
  await page.getByRole('button',{name:'Change shortcut for Component labels'}).click();
  await page.keyboard.press('Shift+L');
  await expect(page.getByText(/Component labels =/)).toBeVisible();
  await page.getByRole('button',{name:'Done'}).click();
  await expect(page.getByTestId('shortcut-settings')).toHaveCount(0);

  await page.keyboard.press('Shift+L');
  await expect(labelMode).toHaveValue('off');
  await page.keyboard.press('l');
  await expect(labelMode).toHaveValue('off');
  await page.keyboard.press('Shift+L');
  await expect(labelMode).toHaveValue('all');

  await page.getByRole('button',{name:'Bật Kích thước + Màu/Vật liệu'}).click();
  await page.getByRole('button',{name:'Save Manifest & Open Editor'}).click();
  await page.getByRole('button',{name:'Lock placement'}).click();
  await expect(page.getByTestId('customize-panel')).toBeVisible();

  const material=page.locator('label:has-text("Material") + select');
  await material.selectOption('mat_oak_light');
  await expect(material).toHaveValue('mat_oak_light');
  await page.keyboard.press('Control+Z');
  await expect(material).toHaveValue('');
  await page.keyboard.press('Control+Shift+Z');
  await expect(material).toHaveValue('mat_oak_light');
});
