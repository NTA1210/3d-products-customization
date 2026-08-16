import type {Document,Mesh,Node} from '@gltf-transform/core';

export type StructureWarning={
  code:string;
  severity:'INFO'|'WARNING'|'ERROR';
  message:string;
  sourceId?:string;
};

function pad(value:number,size=4){return String(value).padStart(size,'0');}
function nodeId(index:number){return`node_${pad(index)}`;}
function meshId(index:number){return`mesh_${pad(index)}`;}

function determinantSign(scale:number[]){
  const determinant=scale[0]*scale[1]*scale[2];
  if(Math.abs(determinant)<=1e-12)return 0;
  return determinant<0?-1:1;
}

export function collectStructureWarnings(document:Document):StructureWarning[]{
  const root=document.getRoot();
  const scenes=root.listScenes();
  const nodes=root.listNodes();
  const meshes=root.listMeshes();
  const warnings:StructureWarning[]=[];

  if(meshes.length===0){
    warnings.push({
      code:'NO_RENDERABLE_MESH',
      severity:'ERROR',
      message:'Asset contains no mesh. It cannot be prepared as a customizable 3D product.',
    });
  }

  if(scenes.length===0){
    warnings.push({
      code:'NO_SCENE',
      severity:'WARNING',
      message:
        'Asset defines no scene. glTF can be used as an entity library, but the product editor requires an explicit scene/root composition before placement.',
    });
  }else if(scenes.length>1){
    warnings.push({
      code:'MULTIPLE_SCENES',
      severity:'WARNING',
      message:
        `Asset defines ${scenes.length} scenes. The editor uses one runtime scene at a time; verify the intended product scene before saving the manifest.`,
    });
  }

  const meshUsers=new Map<Mesh,Node[]>();
  for(const node of nodes){
    const mesh=node.getMesh();
    if(!mesh)continue;
    const list=meshUsers.get(mesh)??[];
    list.push(node);
    meshUsers.set(mesh,list);
  }
  for(const[mesh,users]of meshUsers){
    if(users.length<=1)continue;
    const index=meshes.indexOf(mesh);
    warnings.push({
      code:'SHARED_MESH_REFERENCES',
      severity:'INFO',
      message:
        `Mesh ${index>=0?meshId(index):mesh.getName()||'(unknown)'} is referenced by ${users.length} nodes. Each node instance keeps a separate component identity and transform.`,
      sourceId:index>=0?meshId(index):undefined,
    });
  }

  for(const[nodeIndex,node]of nodes.entries()){
    const scale=[...node.getScale()];
    if(scale.some(value=>!Number.isFinite(value))){
      warnings.push({
        code:'NON_FINITE_NODE_SCALE',
        severity:'ERROR',
        message:'Node scale contains a non-finite value.',
        sourceId:nodeId(nodeIndex),
      });
      continue;
    }

    const sign=determinantSign(scale);
    if(sign===0){
      warnings.push({
        code:'NON_INVERTIBLE_NODE_SCALE',
        severity:'WARNING',
        message:
          `Node has a zero or near-zero authored scale [${scale.join(', ')}]. The part may be invisible and cannot be resized reliably until its source transform is corrected.`,
        sourceId:nodeId(nodeIndex),
      });
    }else if(sign<0){
      warnings.push({
        code:'MIRRORED_NODE_SCALE',
        severity:'INFO',
        message:
          `Node uses a mirrored authored scale [${scale.join(', ')}]. Preserve handedness/winding when exporting customized geometry.`,
        sourceId:nodeId(nodeIndex),
      });
    }

    const absolute=scale.map(Math.abs);
    const nonZero=absolute.filter(value=>value>1e-12);
    if(nonZero.length===3){
      const max=Math.max(...nonZero),min=Math.min(...nonZero);
      if(max/min>1000){
        warnings.push({
          code:'EXTREME_NON_UNIFORM_SCALE',
          severity:'WARNING',
          message:
            `Node authored scale is extremely non-uniform [${scale.join(', ')}]. Review physical dimensions and normal rendering before enabling component resizing.`,
          sourceId:nodeId(nodeIndex),
        });
      }
    }
  }

  for(const[meshIndex,mesh]of meshes.entries()){
    if(mesh.listPrimitives().length>1){
      warnings.push({
        code:'MULTI_PRIMITIVE_MESH',
        severity:'INFO',
        message:
          `Mesh contains ${mesh.listPrimitives().length} primitives. Primitive-level components must export through independent child nodes when their transforms differ.`,
        sourceId:meshId(meshIndex),
      });
    }
  }

  return warnings;
}
