import type {Mesh,Node,Texture} from '@gltf-transform/core';

export type QualityWarning={code:string;severity:'INFO'|'WARNING'|'ERROR';message:string;sourceId?:string};
export type QualityOptions={textureResolutionThreshold:number;textureBytesThreshold:number;rootScaleMin:number;rootScaleMax:number};

type Dimensions={width:number;height:number};
function u16be(bytes:Uint8Array,offset:number){return(bytes[offset]<<8)|bytes[offset+1];}
function u32be(bytes:Uint8Array,offset:number){return(bytes[offset]*0x1000000)+(bytes[offset+1]<<16)+(bytes[offset+2]<<8)+bytes[offset+3];}
function nodeId(index:number){return`node_${String(index).padStart(4,'0')}`;}

export function imageDimensions(bytes:Uint8Array,mimeType?:string|null):Dimensions|undefined{
  if((mimeType==='image/png'||(!mimeType&&bytes.length>=24))&&bytes.length>=24&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47){return{width:u32be(bytes,16),height:u32be(bytes,20)};}
  if((mimeType==='image/jpeg'||mimeType==='image/jpg'||(!mimeType&&bytes[0]===0xff&&bytes[1]===0xd8))&&bytes.length>=10){let offset=2;while(offset+8<bytes.length){if(bytes[offset]!==0xff){offset+=1;continue;}const marker=bytes[offset+1];if(marker===0xd8||marker===0xd9){offset+=2;continue;}const length=u16be(bytes,offset+2);if(length<2||offset+2+length>bytes.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=7)return{height:u16be(bytes,offset+5),width:u16be(bytes,offset+7)};offset+=2+length;}}
  return undefined;
}

function collectMeshReferenceWarnings(nodes:Node[]):QualityWarning[]{
  const warnings:QualityWarning[]=[];
  const users=new Map<Mesh,Array<{node:Node;index:number}>>();
  for(const[index,node]of nodes.entries()){
    const mesh=node.getMesh();
    if(!mesh)continue;
    const list=users.get(mesh)??[];
    list.push({node,index});
    users.set(mesh,list);
  }
  for(const[mesh,items]of users){
    if(items.length>1){
      warnings.push({
        code:'SHARED_MESH_REFERENCES',
        severity:'INFO',
        message:`One source mesh is referenced by ${items.length} nodes. Component identity must stay node-specific so each instance can keep an independent transform.`,
        sourceId:nodeId(items[0].index),
      });
    }
    if(mesh.listPrimitives().length>1){
      warnings.push({
        code:'MULTI_PRIMITIVE_MESH',
        severity:'INFO',
        message:`A source mesh contains ${mesh.listPrimitives().length} primitives. Primitive-level parts must be isolated before independent transform/material export.`,
        sourceId:nodeId(items[0].index),
      });
    }
  }
  return warnings;
}

function collectNodeTransformWarnings(nodes:Node[]):QualityWarning[]{
  const warnings:QualityWarning[]=[];
  for(const[index,node]of nodes.entries()){
    const scale=[...node.getScale()];
    if(scale.some(value=>!Number.isFinite(value))){
      warnings.push({
        code:'NON_FINITE_NODE_SCALE',
        severity:'ERROR',
        message:'Node scale contains a non-finite value and cannot be customized safely.',
        sourceId:nodeId(index),
      });
      continue;
    }
    const determinant=scale[0]*scale[1]*scale[2];
    if(Math.abs(determinant)<=1e-12){
      warnings.push({
        code:'NON_INVERTIBLE_NODE_SCALE',
        severity:'WARNING',
        message:`Node has a zero or near-zero authored scale [${scale.join(', ')}]. The part may be invisible and cannot be resized reliably until its source transform is corrected.`,
        sourceId:nodeId(index),
      });
    }else if(determinant<0){
      warnings.push({
        code:'MIRRORED_NODE_SCALE',
        severity:'INFO',
        message:`Node uses a mirrored authored scale [${scale.join(', ')}]. Export must preserve handedness and face winding.`,
        sourceId:nodeId(index),
      });
    }
    const absolute=scale.map(Math.abs).filter(value=>value>1e-12);
    if(absolute.length===3&&Math.max(...absolute)/Math.min(...absolute)>1000){
      warnings.push({
        code:'EXTREME_NON_UNIFORM_SCALE',
        severity:'WARNING',
        message:`Node authored scale is extremely non-uniform [${scale.join(', ')}]. Review physical dimensions and normals before enabling resize.`,
        sourceId:nodeId(index),
      });
    }
  }
  return warnings;
}

export function collectModelQualityWarnings(nodes:Node[],textures:Texture[],options:QualityOptions):QualityWarning[]{
  const warnings:QualityWarning[]=[];
  for(const [index,node] of nodes.entries()){
    if(node.getParentNode())continue;
    const scale=node.getScale(),absolute=scale.map(value=>Math.abs(value)),max=Math.max(...absolute),min=Math.min(...absolute);
    if(max-min>1e-6)warnings.push({code:'NON_UNIFORM_ROOT_SCALE',severity:'WARNING',message:`Root node ${index} uses non-uniform scale [${scale.join(', ')}]. Review placement and physical dimensions before customization.`,sourceId:nodeId(index)});
    else if(Math.abs(max-1)>1e-6)warnings.push({code:'ROOT_SCALE_NON_IDENTITY',severity:'INFO',message:`Root node ${index} has authored scale ${scale[0]}. glTF linear units are meters; review the resulting physical size before locking placement.`,sourceId:nodeId(index)});
    if(min<options.rootScaleMin||max>options.rootScaleMax)warnings.push({code:'ROOT_SCALE_SUSPICIOUS',severity:'WARNING',message:`Root node ${index} scale is outside the configured review range ${options.rootScaleMin}–${options.rootScaleMax}.`,sourceId:nodeId(index)});
  }
  warnings.push(...collectNodeTransformWarnings(nodes));
  warnings.push(...collectMeshReferenceWarnings(nodes));
  for(const [index,texture] of textures.entries()){
    const image=texture.getImage();if(!image)continue;
    const dimensions=imageDimensions(image,texture.getMimeType());
    if(dimensions&&Math.max(dimensions.width,dimensions.height)>options.textureResolutionThreshold)warnings.push({code:'TEXTURE_RESOLUTION_HIGH',severity:'WARNING',message:`Texture ${index} is ${dimensions.width}×${dimensions.height}, above the configured ${options.textureResolutionThreshold}px warning threshold.`,sourceId:`texture_${String(index).padStart(4,'0')}`});
    if(image.byteLength>options.textureBytesThreshold)warnings.push({code:'TEXTURE_BYTES_HIGH',severity:'WARNING',message:`Texture ${index} uses ${image.byteLength} encoded bytes, above the configured ${options.textureBytesThreshold}-byte warning threshold.`,sourceId:`texture_${String(index).padStart(4,'0')}`});
  }
  return warnings;
}
