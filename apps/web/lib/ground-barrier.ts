export type GroundBarrierPhase='clear'|'resisting'|'released';

export type GroundBarrierResolution={
  phase:GroundBarrierPhase;
  correctionY:number;
  released:boolean;
  penetration:number;
  progress:number;
};

const EPSILON=1e-6;

export function resolveGroundBarrier(bottomY:number,breakDistance:number,released:boolean):GroundBarrierResolution{
  if(bottomY>=-EPSILON){
    return{phase:'clear',correctionY:0,released:false,penetration:0,progress:0};
  }

  const penetration=-bottomY;
  const threshold=Math.max(breakDistance,EPSILON);
  if(released||penetration>=threshold){
    return{phase:'released',correctionY:0,released:true,penetration,progress:1};
  }

  return{
    phase:'resisting',
    correctionY:penetration,
    released:false,
    penetration,
    progress:Math.min(1,penetration/threshold),
  };
}
