import type { ComponentManifest,ComponentVariant,MaterialPreset } from '@product3d/model-schema';

export function canApplyMaterial(component:ComponentManifest,material:MaterialPreset){
  const allowed=component.allowedMaterialCategories;
  return !allowed?.length || allowed.includes(material.category);
}

export function canApplyVariant(component:ComponentManifest,variant:ComponentVariant){
  if(!component.variantGroupId || component.variantGroupId!==variant.groupId)return false;
  return !variant.compatibleComponentRoles.length || variant.compatibleComponentRoles.includes(component.role);
}
