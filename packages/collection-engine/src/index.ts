import {z} from 'zod';

export const CollectionProductSchema=z.object({
  id:z.string().min(1),name:z.string().min(1),category:z.string().min(1),
  styleTags:z.array(z.string()).default([]),materialTags:z.array(z.string()).default([]),
  colorFamily:z.string().nullable().optional(),componentFeatures:z.array(z.string()).default([]),
  thumbnailUrl:z.string().url().nullable().optional(),metadata:z.record(z.unknown()).default({}),
});
export type CollectionProduct=z.infer<typeof CollectionProductSchema>;
export type CollectionScore={product:CollectionProduct;score:number;breakdown:{style:number;material:number;color:number;other:number}};

function normalizedSet(values:string[]){return new Set(values.map(value=>value.trim().toLowerCase()).filter(Boolean));}
function jaccard(a:string[],b:string[]){const left=normalizedSet(a),right=normalizedSet(b);if(!left.size&&!right.size)return 0;let intersection=0;for(const value of left)if(right.has(value))intersection+=1;const union=new Set([...left,...right]).size;return union?intersection/union:0;}
function exact(a?:string|null,b?:string|null){return a&&b&&a.trim().toLowerCase()===b.trim().toLowerCase()?1:0;}

export function scoreCollectionProduct(source:CollectionProduct,candidate:CollectionProduct):CollectionScore{
  const style=jaccard(source.styleTags,candidate.styleTags);
  const material=jaccard(source.materialTags,candidate.materialTags);
  const color=exact(source.colorFamily,candidate.colorFamily);
  const category=exact(source.category,candidate.category);
  const features=jaccard(source.componentFeatures,candidate.componentFeatures);
  const other=(category+features)/2;
  const score=style*.5+material*.25+color*.15+other*.1;
  return{product:candidate,score,breakdown:{style,material,color,other}};
}

export function rankCollection(source:CollectionProduct,candidates:CollectionProduct[],limit=6){
  return candidates.filter(candidate=>candidate.id!==source.id).map(candidate=>scoreCollectionProduct(source,candidate)).sort((a,b)=>b.score-a.score||a.product.name.localeCompare(b.product.name)).slice(0,Math.max(1,limit));
}
