import {Document} from '@gltf-transform/core';
import {describe,expect,it} from 'vitest';
import {
  applyProductScenePolicy,
  assertSupportedRequiredExtensions,
  requiredExtensionsFromGlb,
} from '../workers/asset-processing/src/gltf-policy';

function glbWithJson(json:Record<string,unknown>){
  const encoder=new TextEncoder();
  const raw=encoder.encode(JSON.stringify(json));
  const paddedLength=Math.ceil(raw.length/4)*4;
  const total=12+8+paddedLength;
  const bytes=new Uint8Array(total);
  const view=new DataView(bytes.buffer);
  view.setUint32(0,0x46546c67,true);
  view.setUint32(4,2,true);
  view.setUint32(8,total,true);
  view.setUint32(12,paddedLength,true);
  view.setUint32(16,0x4e4f534a,true);
  bytes.set(raw,20);
  bytes.fill(0x20,20+raw.length,20+paddedLength);
  return bytes;
}

describe('glTF product policy',()=>{
  it('reads required extensions from GLB JSON chunk',()=>{
    const bytes=glbWithJson({asset:{version:'2.0'},extensionsRequired:['KHR_materials_unlit']});
    expect(requiredExtensionsFromGlb(bytes)).toEqual(['KHR_materials_unlit']);
  });

  it('rejects unknown required extensions instead of silently dropping semantics',()=>{
    const bytes=glbWithJson({asset:{version:'2.0'},extensionsRequired:['VENDOR_product_semantics']});
    expect(()=>assertSupportedRequiredExtensions(bytes)).toThrow(/UNSUPPORTED_REQUIRED_EXTENSION/);
  });

  it('accepts known registered required extensions',()=>{
    const bytes=glbWithJson({asset:{version:'2.0'},extensionsRequired:['KHR_materials_unlit']});
    expect(assertSupportedRequiredExtensions(bytes)).toEqual(['KHR_materials_unlit']);
  });

  it('rejects scene-less entity libraries for the product editor',()=>{
    const document=new Document();
    const buffer=document.createBuffer();
    const position=document.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,0,1,0,0,0,1,0])).setBuffer(buffer);
    const primitive=document.createPrimitive().setAttribute('POSITION',position);
    document.createMesh('Library Mesh').addPrimitive(primitive);
    expect(()=>applyProductScenePolicy(document)).toThrow(/PRODUCT_SCENE_REQUIRED/);
  });

  it('sets a deterministic default and warns for multiple scenes',()=>{
    const document=new Document();
    const buffer=document.createBuffer();
    const position=document.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,0,1,0,0,0,1,0])).setBuffer(buffer);
    const primitive=document.createPrimitive().setAttribute('POSITION',position);
    const mesh=document.createMesh('Mesh').addPrimitive(primitive);
    const node=document.createNode('Product').setMesh(mesh);
    document.createScene('Scene A').addChild(node);
    document.createScene('Scene B');
    const warnings=applyProductScenePolicy(document);
    expect(document.getRoot().getDefaultScene()?.getName()).toBe('Scene A');
    expect(warnings.map(warning=>warning.code)).toContain('DEFAULT_SCENE_MISSING');
    expect(warnings.map(warning=>warning.code)).toContain('MULTIPLE_SCENES');
  });
});
