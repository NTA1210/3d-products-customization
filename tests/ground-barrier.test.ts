import {describe,expect,it} from 'vitest';
import {resolveGroundBarrier} from '../apps/web/lib/ground-barrier';

describe('soft ground barrier',()=>{
  it('does nothing above the ground plane',()=>{
    expect(resolveGroundBarrier(.25,.1,false)).toEqual({phase:'clear',correctionY:0,released:false,penetration:0,progress:0});
  });

  it('holds the component at Y=0 while the drag has not pushed through the threshold',()=>{
    const result=resolveGroundBarrier(-.04,.1,false);
    expect(result.phase).toBe('resisting');
    expect(result.correctionY).toBeCloseTo(.04);
    expect(result.released).toBe(false);
    expect(result.progress).toBeCloseTo(.4);
  });

  it('releases once the user keeps dragging past the threshold',()=>{
    const result=resolveGroundBarrier(-.12,.1,false);
    expect(result.phase).toBe('released');
    expect(result.correctionY).toBe(0);
    expect(result.released).toBe(true);
    expect(result.progress).toBe(1);
  });

  it('stays released while below ground and resets after returning above it',()=>{
    expect(resolveGroundBarrier(-.01,.1,true).released).toBe(true);
    expect(resolveGroundBarrier(.01,.1,true)).toEqual({phase:'clear',correctionY:0,released:false,penetration:0,progress:0});
  });
});
