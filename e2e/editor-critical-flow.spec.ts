import {expect,test,type Page, type Route} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const api='http://127.0.0.1:4000/api';
const origin='http://127.0.0.1:3000';
const fixture=resolve('examples/fixtures/proper-components.glb');
const cors={'access-control-allow-origin':origin,'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'};

async function json(route:Route,value:unknown,status=200){await route.fulfill({status,headers:{...cors,'content-type':'application/json'},body:JSON.stringify(value)});}

async function mockTransport(page:Page){
  let createdProject=false,version=0;
  await page.route('http://127.0.0.1:54321/**',async route=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
    return json(route,{Key:'assets/asset-e2e/source/proper-components.glb'});
  });
  await page.route(`${api}/**`,async route=>{
    const request=route.request(),method=request.method(),url=new URL(request.url()),path=url.pathname;
    if(method==='OPTIONS')return route.fulfill({status:204,headers:cors});
    if(path==='/api/assets/import'&&method==='POST')return json(route,{asset:{id:'asset-e2e'},upload:{bucket:'product3d',path:'assets/asset-e2e/source/proper-components.glb',token:'e2e-signed-token',expiresInSeconds:900}});
    if(path==='/api/assets/asset-e2e/analyze'&&method==='POST')return json(route,{jobId:'asset-job-e2e'});
    if(path==='/api/jobs/asset-job-e2e'&&method==='GET')return json(route,{id:'asset-job-e2e',status:'COMPLETED'});
    if(path==='/api/assets/asset-e2e/analysis'&&method==='GET')return json(route,{version:1,unitScaleToMm:1000,stats:{nodes:1,meshes:1,primitives:1,triangles:12,materials:1,textures:0},meshes:[],componentCandidates:[],warnings:[]});
    if(path==='/api/assets/asset-e2e/manifest'&&method==='PUT')return json(route,{id:'manifest-e2e',version:1});
    if(path==='/api/assets/asset-e2e/manifest'&&method==='GET')return json(route,null);
    if(path==='/api/styles'&&method==='GET')return json(route,[]);
    if(path==='/api/variants'&&method==='GET'||path.startsWith('/api/variants?'))return json(route,[]);
    if(path==='/api/workshops'&&method==='GET')return json(route,[]);
    if(path==='/api/projects'&&method==='GET')return json(route,createdProject?[{id:'project-e2e',name:'E2E Product',modelAssetId:'asset-e2e',updatedAt:new Date().toISOString(),modelAsset:{id:'asset-e2e',name:'proper-components',status:'READY'},versions:[]}]:[]);
    if(path==='/api/projects'&&method==='POST'){createdProject=true;return json(route,{id:'project-e2e',name:'E2E Product'});}
    if(path==='/api/projects/project-e2e/versions'&&method==='POST'){version+=1;return json(route,{id:`version-e2e-${version}`,name:`Version ${version}`,configurationJson:{},createdAt:new Date().toISOString()});}
    if(path==='/api/projects/project-e2e/rfq'&&method==='GET')return json(route,[]);
    if(path==='/api/projects/project-e2e/export'&&method==='POST')return json(route,{jobId:'export-job-e2e',format:'GLB'});
    if(path==='/api/jobs/export-job-e2e'&&method==='GET')return json(route,{id:'export-job-e2e',status:'COMPLETED'});
    if(path==='/api/jobs/export-job-e2e/artifact'&&method==='GET')return json(route,{url:`${origin}/e2e-export.glb`,filename:'e2e-product.glb'});
    if(method==='GET')return json(route,[]);
    return json(route,{});
  });
  await page.route(`${origin}/e2e-export.glb`,async route=>route.fulfill({status:200,headers:{'content-type':'model/gltf-binary','content-disposition':'attachment; filename="e2e-product.glb"'},body:await readFile(fixture)}));
}

test('Import → Prepare → Lock → Customize → Undo/Redo → Save Version → Export GLB',async({page})=>{
  await mockTransport(page);
  await page.goto('/');
  await expect(page.getByText('e2e@example.test')).toBeVisible();

  const glbInput=page.locator('input[type="file"][accept=".glb"]');
  await expect(glbInput).toBeEnabled();
  await glbInput.setInputFiles(fixture);
  await expect(page.getByText('Asset: ready')).toBeVisible({timeout:15_000});
  await expect(page.locator('.component-card').first()).toBeVisible();

  await page.locator('.component-card').first().click();
  await page.getByLabel('Editable',{exact:true}).check();
  await page.locator('label.check.inline').filter({hasText:/^\s*X\s*$/}).locator('input').check();
  await page.getByRole('button',{name:'Save Manifest & Open Editor'}).click();

  await expect(page.getByRole('button',{name:'Lock placement'})).toBeVisible();
  await page.getByRole('button',{name:'Lock placement'}).click();
  await expect(page.getByText('Locked · Customize')).toBeVisible();

  const width=page.locator('label').filter({hasText:'WIDTH (mm)'}).locator('xpath=following-sibling::input[1]');
  await expect(width).toBeEnabled();
  const original=Number(await width.inputValue()),changed=Math.round((original+25)*1000)/1000;
  await width.fill(String(changed));
  await expect(width).toHaveValue(String(changed));

  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(width).not.toHaveValue(String(changed));
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  await expect(width).toHaveValue(String(changed));

  const material=page.locator('label').filter({hasText:/^Material$/}).locator('xpath=following-sibling::select[1]');
  await expect(material).toBeEnabled();
  await material.selectOption({index:1});
  await expect(material).not.toHaveValue('');

  const configDownloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Configuration JSON'}).click();
  const configDownload=await configDownloadPromise,configPath=await configDownload.path();
  expect(configPath).toBeTruthy();
  const snapshot=JSON.parse(await readFile(configPath!,'utf8'));
  expect(snapshot.configuration.placement.locked).toBe(true);
  expect(snapshot.configuration.components[Object.keys(snapshot.configuration.components)[0]].dimensionsMm.width).toBe(changed);

  await page.getByRole('button',{name:'Create Project'}).click();
  await expect(page.getByText(/Project: project-/)).toBeVisible();
  await page.getByRole('button',{name:'Save Version'}).click();

  await page.getByLabel('Export format').selectOption('GLB');
  const exportDownloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export GLB'}).click();
  const exportDownload=await exportDownloadPromise;
  expect(exportDownload.suggestedFilename()).toBe('e2e-product.glb');
});
