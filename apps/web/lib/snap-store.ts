'use client';

import { create } from 'zustand';

export type SnapCandidateState = {
  sourceComponentId: string;
  sourceAnchorId: string;
  sourceAnchorName: string;
  targetComponentId: string;
  targetComponentName: string;
  targetAnchorId: string;
  targetAnchorName: string;
  gapMm: number;
  compatible: boolean;
  ready: boolean;
};

type SnapInteractionStore = {
  snapEnabled: boolean;
  labelsVisible: boolean;
  candidate?: SnapCandidateState;
  toggleSnap: () => void;
  toggleLabels: () => void;
  setCandidate: (candidate?: SnapCandidateState) => void;
  reset: () => void;
};

export const useSnapInteractionStore = create<SnapInteractionStore>((set) => ({
  snapEnabled: true,
  labelsVisible: true,
  candidate: undefined,
  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled, candidate: undefined })),
  toggleLabels: () => set((state) => ({ labelsVisible: !state.labelsVisible })),
  setCandidate: (candidate) => set({ candidate }),
  reset: () => set({ candidate: undefined }),
}));
