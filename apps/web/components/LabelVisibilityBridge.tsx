'use client';

import {useEffect} from 'react';
import {useSnapInteractionStore} from '../lib/snap-store';

/**
 * drei <Html> renders through a DOM portal, so THREE.Object3D.visible alone is
 * not a reliable visibility boundary for the generated HTML nodes. Mirror the
 * semantic label mode onto <body>; editor CSS then owns DOM-label visibility.
 */
export default function LabelVisibilityBridge(){
  const labelMode=useSnapInteractionStore(state=>state.labelMode);

  useEffect(()=>{
    document.body.dataset.componentLabels=labelMode;
    return()=>{delete document.body.dataset.componentLabels;};
  },[labelMode]);

  return null;
}
