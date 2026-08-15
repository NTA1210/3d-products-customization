import {readFile} from 'node:fs/promises';
import {describe,expect,it} from 'vitest';
import validator from 'gltf-validator';

const fixtures=['proper-components.glb','disconnected-islands.glb','continuous-mesh.glb','multi-material.glb'];

describe('required GLB fixtures',()=>{
  for(const name of fixtures)it(`${name} is valid GLB`,async()=>{
    const bytes=new Uint8Array(await readFile(new URL(`../examples/fixtures/${name}`,import.meta.url)));
    const report=await validator.validateBytes(bytes,{uri:name,format:'glb'});
    expect(report.issues.numErrors).toBe(0);
  });
});
