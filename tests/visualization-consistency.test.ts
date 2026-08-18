import {describe,expect,it} from 'vitest';
import {VisualizationConsistencyResponseSchema} from '../apps/api/src/ai/ai-provider.service';

describe('visualization consistency response',()=>{
  it('requires bounded identity-preservation scores',()=>{
    const result=VisualizationConsistencyResponseSchema.parse({summary:'The generated scene preserves the product identity.',shapeScore:.94,componentScore:.9,materialColorScore:.82,observations:[{category:'MATERIAL_COLOR',severity:'INFO',message:'Lighting makes the wood appear slightly warmer.'}]});
    expect(result.shapeScore).toBe(.94);
    expect(result.observations[0].category).toBe('MATERIAL_COLOR');
  });
  it('rejects scores outside 0..1',()=>{
    expect(()=>VisualizationConsistencyResponseSchema.parse({summary:'Bad',shapeScore:1.2,componentScore:.8,materialColorScore:.8,observations:[]})).toThrow();
  });
});
