'use client';

import { createElement, useEffect } from 'react';

export default function ModelViewerPreview({ src }: { src: string }) {
  useEffect(() => {
    void import('@google/model-viewer');
  }, []);

  return createElement('model-viewer' as any, {
    src,
    ar: true,
    'ar-modes': 'webxr scene-viewer quick-look',
    'camera-controls': true,
    'touch-action': 'pan-y',
    'shadow-intensity': '1',
    style: { width: '100%', height: '360px', background: '#11151b' },
  } as any);
}
