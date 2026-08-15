import type {Node,Texture} from '@gltf-transform/core';

export type QualityWarning={code:string;severity:'INFO'|'WARNING'|'ERROR';message:string;sourceId?:string};
export type QualityOptions={textureResolutionThreshold:number;textureBytesThreshold:number;rootScaleMin:number;rootScaleMax:number};

type Dimensions={width:number;height:number};
function u16be(bytes:Uint8Array,offset:number){return(bytes[offset]<<8)|bytes[offset+1];}
function u32be(bytes:Uint8Array,offset:number){return(bytes[offset]*0x1000000)+(bytes[offset+1]<<16)+(bytes[offset+2]<<8)+bytes[offset+3];}

export function imageDimensions(bytes:Uint8Array,mimeType?:string|null):Dimensions|undefined{
  if((mimeType==='image/png'||(!mimeType&&bytes.length>=24))&&bytes.length>=24&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47){return{width:u32be(bytes,16),height:u32be(bytes,20)};}
  if((mimeType==='image/jpeg'||mimeType==='image/jpg'||(!mimeType&&bytes[0]===0xff&&bytes[1]===0xd8))&&bytes.length>=10){let offset=2;while(offset+8<bytes.length){if(bytes[offset]!==0xff){offset+=1;continue;}const marker=bytes[offset+1];if(marker===0xd8||marker===0xd9){offset+=2;continue;}const length=u16be(bytes,offset+2);if(length<2||offset+2+length>bytes.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=7)return{height:u16be(bytes,offset+5),width:u16be(bytes,offset+7)};offset+=2+length;}}
  return undefined;
}

export function collectModelQualityWarnings(nodes:Node[],textures:Texture[],options:QualityOptions):QualityWarning[]{
  const warnings:QualityWarning[]=[];
  for(const [index,node] of nodes.entries()){
    if(node.getParentNode())continue;
    const scale=node.getScale(),absolute=scale.map(value=>Math.abs(value)),max=Math.max(...absolute),min=Math.min(...absolute);
    if(max-min>1e-6)warnings.push({code:'NON_UNIFORM_ROOT_SCALE',severity:'WARNING',message:`Root node ${index} uses non-uniform scale [${scale.join(', ')}]. Review placement and physical dimensions before customization.`,sourceId:`node_${String(index).padStart(4,'0')}`});
    else if(Math.abs(max-1)>1e-6)warnings.push({code:'ROOT_SCALE_NON_IDENTITY',severity:'INFO',message:`Root node ${index} has authored scale ${scale[0]}. glTF linear units are meters; review the resulting physical size before locking placement.`,sourceId:`node_${String(index).padStart(4,'0')}`});
    if(min<options.rootScaleMin||max>options.rootScaleMax)warnings.push({code:'ROOT_SCALE_SUSPICIOUS',severity:'WARNING',message:`Root node ${index} scale is outside the configured review range ${options.rootScaleMin}–${options.rootScaleMax}.`,sourceId:`node_${String(index).padStart(4,'0')}`});
  }
  for(const [index,texture] of textures.entries()){
    const image=texture.getImage();if(!image)continue;
    const dimensions=imageDimensions(image,texture.getMimeType());
    if(dimensions&&Math.max(dimensions.width,dimensions.height)>options.textureResolutionThreshold)warnings.push({code:'TEXTURE_RESOLUTION_HIGH',severity:'WARNING',message:`Texture ${index} is ${dimensions.width}×${dimensions.height}, above the configured ${options.textureResolutionThreshold}px warning threshold.`,sourceId:`texture_${String(index).padStart(4,'0')}`});
    if(image.byteLength>options.textureBytesThreshold)warnings.push({code:'TEXTURE_BYTES_HIGH',severity:'WARNING',message:`Texture ${index} uses ${image.byteLength} encoded bytes, above the configured ${options.textureBytesThreshold}-byte warning threshold.`,sourceId:`texture_${String(index).padStart(4,'0')}`});
  }
  return warnings;
}
