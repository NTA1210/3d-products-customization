import {Document} from '@gltf-transform/core';
import {describe,expect,it} from 'vitest';
import {collectModelQualityWarnings,imageDimensions} from '../workers/asset-processing/src/quality';

function pngHeader(width:number,height:number){const bytes=new Uint8Array(24);bytes.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],0);bytes.set([0x49,0x48,0x44,0x52],12);bytes[16]=(width>>>24)&255;bytes[17]=(width>>>16)&255;bytes[18]=(width>>>8)&255;bytes[19]=width&255;bytes[20]=(height>>>24)&255;bytes[21]=(height>>>16)&255;bytes[22]=(height>>>8)&255;bytes[23]=height&255;return bytes;}

describe('model quality guardrails',()=>{
  it('reads PNG dimensions without decoding pixels',()=>{expect(imageDimensions(pngHeader(8192,4096),'image/png')).toEqual({width:8192,height:4096});});
  it('warns on non-uniform root scale and oversized textures',()=>{const doc=new Document();doc.createNode('Root').setScale([1,2,1]);doc.createTexture('Huge').setImage(pngHeader(8192,8192)).setMimeType('image/png');const warnings=collectModelQualityWarnings(doc.getRoot().listNodes(),doc.getRoot().listTextures(),{textureResolutionThreshold:4096,textureBytesThreshold:1024*1024,rootScaleMin:.001,rootScaleMax:1000});expect(warnings.some(w=>w.code==='NON_UNIFORM_ROOT_SCALE')).toBe(true);expect(warnings.some(w=>w.code==='TEXTURE_RESOLUTION_HIGH')).toBe(true);});
  it('explains authored non-identity scale instead of claiming glTF units are unknown',()=>{const doc=new Document();doc.createNode('Root').setScale([.01,.01,.01]);const warnings=collectModelQualityWarnings(doc.getRoot().listNodes(),[],{textureResolutionThreshold:4096,textureBytesThreshold:16*1024*1024,rootScaleMin:.001,rootScaleMax:1000});expect(warnings.map(w=>w.code)).toContain('ROOT_SCALE_NON_IDENTITY');expect(warnings.map(w=>w.code)).not.toContain('UNKNOWN_UNIT');});
});
