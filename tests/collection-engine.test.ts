import {describe,expect,it} from 'vitest';
import {CollectionProductSchema,rankCollection,scoreCollectionProduct} from '../packages/collection-engine/src/index';

const source=CollectionProductSchema.parse({id:'source',name:'Source',category:'TABLE',styleTags:['scandinavian','light'],materialTags:['wood','oak'],colorFamily:'natural',componentFeatures:['top','leg'],metadata:{}});
const strong=CollectionProductSchema.parse({id:'strong',name:'Strong',category:'CHAIR',styleTags:['scandinavian','light'],materialTags:['wood','oak'],colorFamily:'natural',componentFeatures:['seat','leg'],metadata:{}});
const weak=CollectionProductSchema.parse({id:'weak',name:'Weak',category:'SHELF',styleTags:['industrial'],materialTags:['metal'],colorFamily:'black',componentFeatures:['frame'],metadata:{}});

describe('collection engine',()=>{
  it('uses the spec weighting exactly',()=>{const scored=scoreCollectionProduct(source,strong);expect(scored.breakdown.style).toBe(1);expect(scored.breakdown.material).toBe(1);expect(scored.breakdown.color).toBe(1);expect(scored.score).toBeCloseTo(.9166667,6)});
  it('ranks stronger deterministic matches first',()=>{const ranked=rankCollection(source,[weak,strong],2);expect(ranked.map(item=>item.product.id)).toEqual(['strong','weak']);expect(ranked[0].score).toBeGreaterThan(ranked[1].score)});
  it('never recommends the source product itself',()=>{expect(rankCollection(source,[source,strong],6).map(item=>item.product.id)).toEqual(['strong'])});
});
