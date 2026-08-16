import {Accessor,Document,MathUtils,Node,Primitive} from '@gltf-transform/core';
import {analyzeTriangleTopology,type TriangleRegion} from '@product3d/geometry-topology';
import type {ComponentManifest,ModelConfiguration,ModelManifest} from '@product3d/model-schema';

export type ComponentSource={node:number;mesh:number;primitive:number;region?:number};
export type PreparedTarget={
  node:Node;
  primitive?:Primitive;
  baseTranslation:[number,number,number];
  baseRotation:[number,number,number];
  baseScale:[number,number,number];
};
type NumericArray=Int8Array|Uint8Array|Int16Array|Uint16Array|Uint32Array|Float32Array;

export function parseComponentId(id:string):ComponentSource{
  const match=/^cmp_node_(\d+)_mesh_(\d+)_prim_(\d+)(?:_region_(\d+))?$/.exec(id);
  if(!match)throw new Error(`EXPORT_UNSTABLE_COMPONENT_ID: ${id}`);
  return{
    node:Number(match[1]),
    mesh:Number(match[2]),
    primitive:Number(match[3]),
    region:match[4]===undefined?undefined:Number(match[4]),
  };
}

export function componentSource(definition:ComponentManifest):ComponentSource{
  const parsed=parseComponentId(definition.id);
  if(parsed.region!==undefined)return parsed;
  const regionId=definition.sourceRegionIds?.[0];
  const regionMatch=regionId?/_island_(\d+)$/.exec(regionId):null;
  return regionMatch?{...parsed,region:Number(regionMatch[1])}:parsed;
}

export function eulerToQuat([x,y,z]:[number,number,number]):[number,number,number,number]{
  const c1=Math.cos(x/2),c2=Math.cos(y/2),c3=Math.cos(z/2);
  const s1=Math.sin(x/2),s2=Math.sin(y/2),s3=Math.sin(z/2);
  return[
    s1*c2*c3+c1*s2*s3,
    c1*s2*c3-s1*c2*s3,
    c1*c2*s3+s1*s2*c3,
    c1*c2*c3-s1*s2*s3,
  ];
}

export function quatToEuler([x,y,z,w]:number[]):[number,number,number]{
  const t0=2*(w*x+y*z),t1=1-2*(x*x+y*y);
  const roll=Math.atan2(t0,t1);
  const t2=Math.max(-1,Math.min(1,2*(w*y-z*x)));
  const pitch=Math.asin(t2);
  const t3=2*(w*z+x*y),t4=1-2*(y*y+z*z);
  const yaw=Math.atan2(t3,t4);
  return[roll,pitch,yaw];
}

function clonePrimitive(doc:Document,source:Primitive){return doc.createPrimitive().copy(source);}

function isolatedMesh(doc:Document,nodeIndex:number){
  const node=doc.getRoot().listNodes()[nodeIndex];
  if(!node)throw new Error(`Source node ${nodeIndex} missing`);
  const original=node.getMesh();
  if(!original)throw new Error(`Source node ${nodeIndex} has no mesh`);
  const sourcePrimitives=[...original.listPrimitives()];
  // Mesh.copy() intentionally copies the RefSet. Detach those refs without disposing them,
  // otherwise the source primitive itself is destroyed before region/primitive isolation.
  const mesh=doc.createMesh(`${original.getName()} Export`).copy(original);
  for(const primitive of [...mesh.listPrimitives()])mesh.removePrimitive(primitive);
  for(const primitive of sourcePrimitives)mesh.addPrimitive(clonePrimitive(doc,primitive));
  node.setMesh(mesh);
  return mesh;
}

function arrayConstructor(source:NumericArray){
  return source.constructor as{new(length:number):NumericArray};
}

function copySubsetAttribute(
  doc:Document,
  source:Accessor,
  vertexIndices:number[],
  center:[number,number,number]|undefined,
  semantic:string,
){
  const sourceArray=source.getArray() as NumericArray|null;
  if(!sourceArray)throw new Error(`REGION_ATTRIBUTE_ARRAY_MISSING: ${semantic}`);
  const elementSize=source.getElementSize();
  let destination:NumericArray;

  if(semantic==='POSITION'&&center){
    // POSITION is converted to float for the centered region. This makes normalized integer
    // accessors safe and avoids losing a fractional region pivot during integer subtraction.
    destination=new Float32Array(vertexIndices.length*elementSize);
    for(let newIndex=0;newIndex<vertexIndices.length;newIndex++){
      const oldIndex=vertexIndices[newIndex];
      for(let component=0;component<elementSize;component++){
        const raw=Number(sourceArray[oldIndex*elementSize+component]);
        const decoded=source.getNormalized()
          ?MathUtils.decodeNormalizedInt(raw,source.getComponentType())
          :raw;
        destination[newIndex*elementSize+component]=component<3?decoded-center[component]:decoded;
      }
    }
  }else{
    const Constructor=arrayConstructor(sourceArray);
    destination=new Constructor(vertexIndices.length*elementSize);
    for(let newIndex=0;newIndex<vertexIndices.length;newIndex++){
      const oldIndex=vertexIndices[newIndex];
      for(let component=0;component<elementSize;component++){
        destination[newIndex*elementSize+component]=sourceArray[oldIndex*elementSize+component] as never;
      }
    }
  }

  return doc
    .createAccessor(source.getName())
    .setArray(destination)
    .setType(source.getType())
    .setBuffer(doc.getRoot().listBuffers()[0]??doc.createBuffer())
    .setNormalized(semantic==='POSITION'&&center?false:source.getNormalized());
}

function topologyForPrimitive(primitive:Primitive){
  const position=primitive.getAttribute('POSITION');
  if(!position?.getArray())throw new Error('REGION_POSITION_REQUIRED');
  if(primitive.listTargets().length)throw new Error('REGION_MORPH_TARGET_UNSUPPORTED');
  return analyzeTriangleTopology({
    positions:position.getArray()!,
    positionStride:position.getElementSize(),
    indices:primitive.getIndices()?.getArray()??null,
  });
}

function createRegionPrimitive(doc:Document,source:Primitive,region:TriangleRegion){
  const center:[number,number,number]=[
    (region.bounds.min[0]+region.bounds.max[0])/2,
    (region.bounds.min[1]+region.bounds.max[1])/2,
    (region.bounds.min[2]+region.bounds.max[2])/2,
  ];
  const primitive=doc
    .createPrimitive()
    .setMode(source.getMode())
    .setMaterial(source.getMaterial())
    .setExtras(source.getExtras());

  for(const semantic of source.listSemantics()){
    const attribute=source.getAttribute(semantic);
    if(attribute){
      primitive.setAttribute(
        semantic,
        copySubsetAttribute(doc,attribute,region.vertexIndices,center,semantic),
      );
    }
  }

  const sourceIndices=source.getIndices();
  const sourceIndexArray=sourceIndices?.getArray();
  const remapped=new Map(region.vertexIndices.map((oldIndex,newIndex)=>[oldIndex,newIndex]));
  const values:number[]=[];
  for(const triangle of region.triangleIndices){
    for(let corner=0;corner<3;corner++){
      const oldIndex=sourceIndexArray
        ?Number(sourceIndexArray[triangle*3+corner])
        :triangle*3+corner;
      const value=remapped.get(oldIndex);
      if(value===undefined)throw new Error(`REGION_INDEX_MAPPING_MISSING: ${oldIndex}`);
      values.push(value);
    }
  }

  const ArrayType=region.vertexIndices.length>65535?Uint32Array:Uint16Array;
  const indices=doc
    .createAccessor()
    .setArray(new ArrayType(values))
    .setType('SCALAR')
    .setBuffer(doc.getRoot().listBuffers()[0]??doc.createBuffer());
  primitive.setIndices(indices);
  return{primitive,center};
}

function componentGroups(manifest:ModelManifest){
  const groups=new Map<number,Array<{definition:ComponentManifest;source:ComponentSource}>>();
  for(const definition of manifest.components){
    const source=componentSource(definition);
    const list=groups.get(source.node)??[];
    list.push({definition,source});
    groups.set(source.node,list);
  }
  return groups;
}

export function prepareComponentTargets(doc:Document,manifest:ModelManifest){
  const targets=new Map<string,PreparedTarget>();
  for(const[nodeIndex,entries]of componentGroups(manifest)){
    const sourceNode=doc.getRoot().listNodes()[nodeIndex];
    if(!sourceNode)throw new Error(`Source node ${nodeIndex} missing`);
    const mustSplit=entries.length>1||entries.some(entry=>entry.source.region!==undefined);

    if(!mustSplit){
      const entry=entries[0];
      const mesh=isolatedMesh(doc,nodeIndex);
      const primitive=mesh.listPrimitives()[entry.source.primitive];
      if(!primitive)throw new Error(`Source primitive ${entry.source.primitive} missing for ${entry.definition.id}`);
      targets.set(entry.definition.id,{
        node:sourceNode,
        primitive,
        baseTranslation:[...sourceNode.getTranslation()],
        baseRotation:quatToEuler(sourceNode.getRotation()),
        baseScale:[...sourceNode.getScale()],
      });
      continue;
    }

    const isolated=isolatedMesh(doc,nodeIndex);
    const sourcePrimitives=[...isolated.listPrimitives()];
    const entriesByPrimitive=new Map<number,typeof entries>();
    for(const entry of entries){
      const list=entriesByPrimitive.get(entry.source.primitive)??[];
      list.push(entry);
      entriesByPrimitive.set(entry.source.primitive,list);
    }

    for(const[primitiveIndex,primitiveEntries]of entriesByPrimitive){
      const sourcePrimitive=sourcePrimitives[primitiveIndex];
      if(!sourcePrimitive)throw new Error(`Source primitive ${primitiveIndex} missing on node ${nodeIndex}`);
      const topology=primitiveEntries.some(entry=>entry.source.region!==undefined)
        ?topologyForPrimitive(sourcePrimitive)
        :undefined;

      for(const entry of primitiveEntries){
        let primitive:Primitive;
        let translation:[number,number,number]=[0,0,0];
        if(entry.source.region!==undefined){
          const region=topology?.regions[entry.source.region];
          if(!region)throw new Error(`REGION_NOT_FOUND: ${entry.definition.id}`);
          const extracted=createRegionPrimitive(doc,sourcePrimitive,region);
          primitive=extracted.primitive;
          translation=extracted.center;
        }else{
          primitive=clonePrimitive(doc,sourcePrimitive);
        }

        const mesh=doc.createMesh(`${entry.definition.name} Export`).addPrimitive(primitive);
        const child=doc
          .createNode(`${entry.definition.name} Export`)
          .setMesh(mesh)
          .setTranslation(translation);
        sourceNode.addChild(child);
        targets.set(entry.definition.id,{
          node:child,
          primitive,
          baseTranslation:translation,
          baseRotation:[0,0,0],
          baseScale:[1,1,1],
        });
      }
      sourcePrimitive.dispose();
    }

    if(isolated.listPrimitives().length===0)sourceNode.setMesh(null);
  }
  return targets;
}

export function applyTargetTransform(
  target:PreparedTarget,
  manifest:ModelManifest,
  state:ModelConfiguration['components'][string],
){
  const ratios={x:1,y:1,z:1};
  for(const dimension of ['width','height','depth'] as const){
    const axis=manifest.axisMapping[dimension];
    const original=state.originalDimensionsMm[dimension];
    ratios[axis]=original===0?1:state.dimensionsMm[dimension]/original;
  }
  target.node.setScale([
    target.baseScale[0]*ratios.x*state.transform.scale[0],
    target.baseScale[1]*ratios.y*state.transform.scale[1],
    target.baseScale[2]*ratios.z*state.transform.scale[2],
  ]);
  target.node.setTranslation([
    target.baseTranslation[0]+state.transform.position[0]/1000,
    target.baseTranslation[1]+state.transform.position[1]/1000,
    target.baseTranslation[2]+state.transform.position[2]/1000,
  ]);
  target.node.setRotation(eulerToQuat([
    target.baseRotation[0]+state.transform.rotation[0],
    target.baseRotation[1]+state.transform.rotation[1],
    target.baseRotation[2]+state.transform.rotation[2],
  ]));
}
