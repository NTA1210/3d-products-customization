import {describe,expect,it} from 'vitest';
import {ManufacturingVisionResponseSchema} from '../apps/api/src/ai/ai-provider.service';

describe('manufacturing Vision response',()=>{
  it('requires structured issue explanations and advisory observations',()=>{
    const parsed=ManufacturingVisionResponseSchema.parse({
      summary:'The deterministic checks found one dimensional issue.',
      visualObservations:['The support appears slender from the side view.'],
      explanations:[{issueId:'rule:leg:width',explanation:'The leg is below the approved width.',impact:'It may reduce stiffness.',suggestedNextStep:'Increase the leg width to the deterministic minimum.'}],
    });
    expect(parsed.explanations[0].issueId).toBe('rule:leg:width');
    expect(parsed.visualObservations).toHaveLength(1);
  });

  it('rejects unstructured free-form provider output',()=>{
    expect(()=>ManufacturingVisionResponseSchema.parse({summary:'Looks fine'})).toThrow();
  });
});
