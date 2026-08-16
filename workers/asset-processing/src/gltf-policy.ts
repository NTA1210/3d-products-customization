import type {Document} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';

export type GltfPolicyWarning={
  code:string;
  severity:'INFO'|'WARNING'|'ERROR';
  message:string;
};

const GLB_MAGIC=0x46546c67;
const JSON_CHUNK=0x4e4f534a;

export const SUPPORTED_REQUIRED_EXTENSIONS=new Set(
  ALL_EXTENSIONS.map(extension=>extension.EXTENSION_NAME),
);

export function requiredExtensionsFromGlb(bytes:Uint8Array):string[]{
  if(bytes.byteLength<20)return[];
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint32(0,true)!==GLB_MAGIC)return[];
  const declaredLength=view.getUint32(8,true);
  if(declaredLength>bytes.byteLength||declaredLength<20)return[];
  const chunkLength=view.getUint32(12,true);
  const chunkType=view.getUint32(16,true);
  if(chunkType!==JSON_CHUNK||20+chunkLength>bytes.byteLength)return[];
  try{
    const jsonText=new TextDecoder().decode(bytes.subarray(20,20+chunkLength)).replace(/\u0000+$/g,'').trim();
    const json=JSON.parse(jsonText) as{extensionsRequired?:unknown};
    return Array.isArray(json.extensionsRequired)
      ?json.extensionsRequired.filter((value):value is string=>typeof value==='string')
      :[];
  }catch{
    return[];
  }
}

export function assertSupportedRequiredExtensions(bytes:Uint8Array){
  const required=requiredExtensionsFromGlb(bytes);
  const unsupported=required.filter(extension=>!SUPPORTED_REQUIRED_EXTENSIONS.has(extension));
  if(unsupported.length){
    throw new Error(
      `UNSUPPORTED_REQUIRED_EXTENSION: ${unsupported.join(', ')}. `+
      'The asset declares extension(s) as required, so importing without understanding them could change geometry or rendering semantics.',
    );
  }
  return required;
}

export function applyProductScenePolicy(document:Document):GltfPolicyWarning[]{
  const root=document.getRoot();
  const scenes=root.listScenes();
  const meshes=root.listMeshes();
  if(meshes.length===0){
    throw new Error('NO_RENDERABLE_MESH: This GLB contains no mesh and cannot be used as a customizable product.');
  }
  if(scenes.length===0){
    // Valid glTF may intentionally act as an entity library, but this application edits one placed product.
    throw new Error(
      'PRODUCT_SCENE_REQUIRED: This GLB contains no scene. glTF permits scene-less entity libraries, but the product editor requires an explicit scene/root composition.',
    );
  }

  const warnings:GltfPolicyWarning[]=[];
  let defaultScene=root.getDefaultScene();
  if(!defaultScene){
    defaultScene=scenes[0];
    root.setDefaultScene(defaultScene);
    warnings.push({
      code:'DEFAULT_SCENE_MISSING',
      severity:'INFO',
      message:'No default scene was authored. The normalized derivative uses the first scene as the deterministic product scene.',
    });
  }
  if(scenes.length>1){
    const defaultIndex=scenes.indexOf(defaultScene);
    warnings.push({
      code:'MULTIPLE_SCENES',
      severity:'WARNING',
      message:
        `Asset contains ${scenes.length} scenes. Customization uses the authored/default product scene (scene ${defaultIndex}); other scenes remain in the canonical asset but are not assumed to be alternate product components.`,
    });
  }
  return warnings;
}
