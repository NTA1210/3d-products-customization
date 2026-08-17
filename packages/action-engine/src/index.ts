import { z } from 'zod';
import type { ModelConfiguration } from '@product3d/model-schema';

const source = z.enum(['MANUAL','PRESET','STYLE','AI']);
const componentBase = {componentId:z.string().min(1),source};

export const EditorActionSchema = z.discriminatedUnion('type',[
  z.object({type:z.literal('SET_DIMENSION'),...componentBase,axis:z.enum(['WIDTH','HEIGHT','DEPTH']),valueMm:z.number().positive()}),
  z.object({type:z.literal('SET_MATERIAL'),...componentBase,materialId:z.string().min(1)}),
  z.object({type:z.literal('SET_COLOR'),...componentBase,color:z.string().regex(/^#[0-9A-Fa-f]{6}$/)}),
  z.object({type:z.literal('SET_POSITION'),...componentBase,axis:z.enum(['X','Y','Z']),value:z.number()}),
  z.object({type:z.literal('SET_ROTATION'),...componentBase,axis:z.enum(['X','Y','Z']),value:z.number()}),
  z.object({type:z.literal('SET_VISIBILITY'),...componentBase,visible:z.boolean()}),
  z.object({type:z.literal('DELETE_COMPONENT'),...componentBase}),
  z.object({type:z.literal('RESTORE_COMPONENT'),...componentBase}),
  z.object({type:z.literal('REPLACE_COMPONENT'),...componentBase,variantId:z.string().min(1)}),
  z.object({
    type:z.literal('ATTACH_COMPONENT'),...componentBase,
    sourceAnchorId:z.string().min(1),targetComponentId:z.string().min(1),targetAnchorId:z.string().min(1),
    createdBy:z.enum(['SNAP','MANUAL']).default('SNAP'),
  }),
  z.object({type:z.literal('DETACH_COMPONENT'),...componentBase}),
  z.object({type:z.literal('RESET_COMPONENT'),...componentBase}),
]);
export type EditorAction = z.infer<typeof EditorActionSchema>;

export interface EditorCommand {
  id:string;
  actions:EditorAction[];
  before:ModelConfiguration;
  after:ModelConfiguration;
}

export class HistoryEngine {
  private undoStack:EditorCommand[]=[];
  private redoStack:EditorCommand[]=[];
  push(command:EditorCommand){this.undoStack.push(command);this.redoStack=[];}
  undo(current:ModelConfiguration){const command=this.undoStack.pop();if(!command)return current;this.redoStack.push(command);return structuredClone(command.before);}
  redo(current:ModelConfiguration){const command=this.redoStack.pop();if(!command)return current;this.undoStack.push(command);return structuredClone(command.after);}
  get canUndo(){return this.undoStack.length>0;}
  get canRedo(){return this.redoStack.length>0;}
}
