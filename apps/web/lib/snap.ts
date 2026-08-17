import type { AnchorDefinition } from '@product3d/model-schema';

export function anchorConnectionType(anchor: AnchorDefinition) {
  return anchor.connectionType?.trim() || 'GENERIC';
}

export function anchorCompatible(source: AnchorDefinition, target: AnchorDefinition) {
  if (!source.snapEnabled || !target.snapEnabled) return false;
  const sourceTypes = source.compatibleTypes?.length ? source.compatibleTypes : ['GENERIC'];
  const targetTypes = target.compatibleTypes?.length ? target.compatibleTypes : ['GENERIC'];
  return sourceTypes.includes(anchorConnectionType(target)) && targetTypes.includes(anchorConnectionType(source));
}

export function anchorsForComponent(anchors: AnchorDefinition[], componentId: string) {
  return anchors.filter((anchor) => anchor.componentId === componentId && anchor.snapEnabled);
}
