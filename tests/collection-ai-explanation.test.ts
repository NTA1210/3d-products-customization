import {describe,expect,it} from 'vitest';
import {CollectionExplanationResponseSchema} from '../apps/api/src/ai/ai-provider.service';

describe('collection AI explanation',()=>{
  it('accepts concise explanations keyed by deterministic product id',()=>{
    const result=CollectionExplanationResponseSchema.parse({summary:'The top matches share the strongest style and material overlap.',explanations:[{productId:'chair-1',explanation:'Strong Scandinavian style overlap and matching oak material tags drive the score.'}]});
    expect(result.explanations[0].productId).toBe('chair-1');
  });

  it('rejects free-form output without product identifiers',()=>{
    expect(()=>CollectionExplanationResponseSchema.parse({summary:'These look good.',explanations:['Nice match']})).toThrow();
  });
});
