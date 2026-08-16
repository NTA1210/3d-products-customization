import {expect,test} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const email=process.env.STAGING_E2E_EMAIL;
const password=process.env.STAGING_E2E_PASSWORD;
if(!email||!password)throw new Error('STAGING_E2E_EMAIL and STAGING_E2E_PASSWORD are required.');

test('live Supabase/worker critical flow exports and re-imports customized GLB',async({page})=>{
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page.getByText(email)).toBeVisible();

  const glbInput=page.locator('input[type="file"][accept=".glb"]');
  await glbInput.setInputFiles(path.resolve('examples/fixtures/proper-components.glb'));
  await expect(page.locator('.component-card').first()).toBeVisible({timeout:180_000});
  await expect(page.getByText('Asset: ready')).toBeVisible({timeout:180_000});

  await page.getByLabel('Editable').check();
  await page.getByLabel('Scaling').selectOption('AXIS_SCALE');
  await page.getByLabel('X').first().check();
  await page.getByRole('button',{name:'Save Manifest & Open Editor'}).click();
  await page.getByRole('button',{name:'Lock placement'}).click();

  const width=page.getByLabel('WIDTH (mm)');
  const initial=Number(await width.inputValue());
  await width.fill(String(Math.max(1,Math.round(initial*0.95))));
  await page.getByLabel('Material').selectOption('mat_oak_light');
  await page.getByRole('button',{name:'Undo'}).click();
  await page.getByRole('button',{name:'Redo'}).click();

  await page.getByRole('button',{name:'Create Project'}).click();
  await expect(page.getByRole('button',{name:'Save Version'})).toBeEnabled();
  await page.getByRole('button',{name:'Save Version'}).click();

  const downloadPromise=page.waitForEvent('download',{timeout:240_000});
  await page.getByRole('button',{name:'Export GLB'}).click();
  const download=await downloadPromise;
  expect(download.suggestedFilename().toLowerCase()).toMatch(/\.glb$/);
  const downloadedPath=await download.path();
  if(!downloadedPath)throw new Error('Browser did not persist the exported GLB.');
  const exported=await readFile(downloadedPath);
  expect(exported.byteLength).toBeGreaterThan(20);
  expect(exported.subarray(0,4).toString('ascii')).toBe('glTF');

  await glbInput.setInputFiles({name:`roundtrip-${Date.now()}.glb`,mimeType:'model/gltf-binary',buffer:exported});
  await expect(page.getByText('Asset Preparation')).toBeVisible();
  await expect(page.locator('.component-card').first()).toBeVisible({timeout:180_000});
  await expect(page.getByText('Asset: ready')).toBeVisible({timeout:180_000});
});
