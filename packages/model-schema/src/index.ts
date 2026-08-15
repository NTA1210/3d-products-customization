import { z } from 'zod';

export const ComponentRole = z.enum([
  'UNKNOWN','TOP','LEG','FRAME','SEAT','BACK','CUSHION','ARMREST','HANDLE',
  'PANEL','SHELF','DOOR','DRAWER','BASE','SUPPORT','DECORATION','OTHER'
]);
export type ComponentRole = z.infer<typeof ComponentRole>;

export const ScalingMode = z.enum(['FIXED','AXIS_SCALE','UNIFORM_SCALE','PARAMETRIC','VARIANT_ONLY']);
export type ScalingMode = z.infer<typeof ScalingMode>;

export const MaterialCategory = z.enum(['WOOD','METAL','FABRIC','STONE','PLASTIC','GLASS','OTHER']);
export type MaterialCategory = z.infer<typeof MaterialCategory>;

export const DimensionsSchema = z.object({width:z.number(),height:z.number(),depth:z.number()});
export type Dimensions3D = z.infer<typeof DimensionsSchema>;

const range = z.object({min:z.number().optional(),max:z.number().optional()}).nullable();

export const DependencyRuleSchema = z.object({
  id:z.string(),
  sourceComponentId:z.string(),
  triggerProperty:z.enum(['WIDTH','HEIGHT','DEPTH','POSITION']),
  targetComponentId:z.string(),
  targetProperty:z.enum(['POSITION_X','POSITION_Y','POSITION_Z','WIDTH','HEIGHT','DEPTH']),
  formula:z.discriminatedUnion('type',[
    z.object({type:z.literal('DELTA_FACTOR'),factor:z.number()}),
    z.object({type:z.literal('SET_VALUE'),value:z.number()}),
    z.object({type:z.literal('CLAMPED_DELTA_FACTOR'),factor:z.number(),min:z.number().optional(),max:z.number().optional()})
  ])
});
export type DependencyRule = z.infer<typeof DependencyRuleSchema>;

export const ComponentManifestSchema = z.object({
  id:z.string(),
  sourceNodeIds:z.array(z.string()).default([]),
  sourceMeshIds:z.array(z.string()).default([]),
  name:z.string(),
  role:ComponentRole.default('UNKNOWN'),
  editable:z.boolean().default(false),
  editableAxes:z.object({x:z.boolean(),y:z.boolean(),z:z.boolean()}).default({x:false,y:false,z:false}),
  scalingMode:ScalingMode.default('FIXED'),
  constraints:z.object({width:range,height:range,depth:range}),
  anchorIds:z.array(z.string()).default([]),
  variantGroupId:z.string().optional(),
  allowedMaterialCategories:z.array(MaterialCategory).optional(),
  materialSlotIds:z.array(z.string()).default([])
});
export type ComponentManifest = z.infer<typeof ComponentManifestSchema>;

export const ModelManifestSchema = z.object({
  modelId:z.string(),
  version:z.number().int().positive(),
  unit:z.literal('mm'),
  axisMapping:z.object({width:z.enum(['x','y','z']),height:z.enum(['x','y','z']),depth:z.enum(['x','y','z'])}),
  components:z.array(ComponentManifestSchema),
  dependencies:z.array(DependencyRuleSchema).default([])
});
export type ModelManifest = z.infer<typeof ModelManifestSchema>;

export const TransformSchema = z.object({
  position:z.tuple([z.number(),z.number(),z.number()]),
  rotation:z.tuple([z.number(),z.number(),z.number()]),
  scale:z.tuple([z.number(),z.number(),z.number()])
});
export type TransformState = z.infer<typeof TransformSchema>;

export const ComponentConfigurationSchema = z.object({
  originalDimensionsMm:DimensionsSchema,
  dimensionsMm:DimensionsSchema,
  transform:TransformSchema,
  materialId:z.string().optional(),
  color:z.string().optional(),
  variantId:z.string().optional(),
  visible:z.boolean().default(true),
  deleted:z.boolean().default(false)
});
export type ComponentConfiguration = z.infer<typeof ComponentConfigurationSchema>;

export const ModelConfigurationSchema = z.object({
  modelId:z.string(),
  manifestVersion:z.number(),
  placement:z.object({locked:z.boolean(),transform:TransformSchema}),
  components:z.record(ComponentConfigurationSchema),
  appliedStyleId:z.string().optional(),
  appliedPresetId:z.string().optional()
});
export type ModelConfiguration = z.infer<typeof ModelConfigurationSchema>;

export const MaterialPresetSchema = z.object({
  id:z.string(),name:z.string(),category:MaterialCategory,baseColor:z.string().optional(),
  roughness:z.number().min(0).max(1).default(0.6),metalness:z.number().min(0).max(1).default(0),
  styleTags:z.array(z.string()).default([]),allowColorTint:z.boolean().default(true)
});
export type MaterialPreset = z.infer<typeof MaterialPresetSchema>;

export const ComponentVariantSchema = z.object({
  id:z.string(),groupId:z.string(),name:z.string(),role:ComponentRole,assetUrl:z.string(),anchorType:z.string(),
  compatibleModelTags:z.array(z.string()).default([]),compatibleComponentRoles:z.array(ComponentRole).default([]),
  dimensionPolicy:z.enum(['KEEP','AUTO_FIT','RULE_BASED'])
});
export type ComponentVariant = z.infer<typeof ComponentVariantSchema>;
