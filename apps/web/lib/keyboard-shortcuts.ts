export type ShortcutAction=
  |'undo'
  |'redo'
  |'move'
  |'rotate'
  |'scale'
  |'focusSelected'
  |'frameAll'
  |'toggleGridSnap'
  |'toggleLabels'
  |'toggleSnap'
  |'gizmoIncrease'
  |'gizmoDecrease'
  |'deleteSelected';

export type ShortcutPreset='maya'|'blender';

export type ShortcutDefinition={
  action:ShortcutAction;
  label:string;
  description:string;
  defaultBinding:string;
};

export const SHORTCUT_DEFINITIONS:ShortcutDefinition[]=[
  {action:'undo',label:'Undo',description:'Hoàn tác thay đổi gần nhất.',defaultBinding:'Mod+Z'},
  {action:'redo',label:'Redo',description:'Làm lại thay đổi vừa Undo.',defaultBinding:'Mod+Shift+Z'},
  {action:'move',label:'Move tool',description:'Chuyển sang công cụ Move.',defaultBinding:'W'},
  {action:'rotate',label:'Rotate tool',description:'Chuyển sang công cụ Rotate.',defaultBinding:'E'},
  {action:'scale',label:'Resize tool',description:'Chuyển sang công cụ Resize khi part cho phép.',defaultBinding:'R'},
  {action:'focusSelected',label:'Frame selected',description:'Đưa camera tới component đang chọn mà không thay đổi model.',defaultBinding:'F'},
  {action:'frameAll',label:'Frame all',description:'Đưa toàn bộ model trở lại khung nhìn.',defaultBinding:'Home'},
  {action:'toggleGridSnap',label:'Grid transform snap',description:'Bật/tắt snap theo bước transform chính xác.',defaultBinding:'X'},
  {action:'toggleLabels',label:'Component labels',description:'Bật/tắt label component theo mode gần nhất.',defaultBinding:'L'},
  {action:'toggleSnap',label:'Anchor magnetic snap',description:'Bật/tắt Magnetic Snap giữa các anchor.',defaultBinding:'S'},
  {action:'gizmoIncrease',label:'Increase gizmo size',description:'Tăng kích thước transform manipulator.',defaultBinding:'='},
  {action:'gizmoDecrease',label:'Decrease gizmo size',description:'Giảm kích thước transform manipulator.',defaultBinding:'-'},
  {action:'deleteSelected',label:'Delete component',description:'Xóa component đang chọn trong Editor.',defaultBinding:'Delete'},
];

export const DEFAULT_SHORTCUT_BINDINGS=Object.fromEntries(
  SHORTCUT_DEFINITIONS.map(item=>[item.action,item.defaultBinding]),
) as Record<ShortcutAction,string>;

export const SHORTCUT_PRESETS:Record<ShortcutPreset,Record<ShortcutAction,string>>={
  maya:{...DEFAULT_SHORTCUT_BINDINGS},
  blender:{
    ...DEFAULT_SHORTCUT_BINDINGS,
    move:'G',
    rotate:'R',
    scale:'S',
    toggleSnap:'Shift+Tab',
    toggleGridSnap:'',
    focusSelected:'F',
    frameAll:'Home',
  },
};

export function isEditableKeyboardTarget(target:EventTarget|null){
  if(typeof HTMLElement==='undefined'||!(target instanceof HTMLElement))return false;
  return target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName);
}

type KeyboardLike={
  key:string;
  ctrlKey:boolean;
  metaKey:boolean;
  altKey:boolean;
  shiftKey:boolean;
};

function normalizeKey(key:string){
  if(key===' ')return'Space';
  if(key==='Esc')return'Escape';
  if(key==='Del')return'Delete';
  if(key.length===1)return key.toUpperCase();
  return key.length?`${key[0].toUpperCase()}${key.slice(1)}`:'';
}

export function shortcutFromEvent(event:KeyboardLike){
  const key=normalizeKey(event.key);
  if(!key||['Control','Meta','Alt','Shift'].includes(key))return'';
  const parts:string[]=[];
  if(event.ctrlKey||event.metaKey)parts.push('Mod');
  if(event.altKey)parts.push('Alt');
  if(event.shiftKey)parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

export function normalizeShortcutBinding(binding:string){
  const tokens=binding.split('+').map(item=>item.trim()).filter(Boolean);
  const modifiers=new Set(tokens.slice(0,-1).map(item=>{
    const lower=item.toLowerCase();
    if(['cmd','command','ctrl','control','mod'].includes(lower))return'Mod';
    if(lower==='alt'||lower==='option')return'Alt';
    if(lower==='shift')return'Shift';
    return item;
  }));
  const key=normalizeKey(tokens.at(-1)??'');
  const ordered=['Mod','Alt','Shift'].filter(item=>modifiers.has(item));
  return key?[...ordered,key].join('+'):'';
}

export function shortcutMatches(event:KeyboardLike,binding:string){
  return Boolean(binding)&&shortcutFromEvent(event)===normalizeShortcutBinding(binding);
}

export function shortcutDisplay(binding:string,apple=false){
  if(!binding)return'Unassigned';
  return normalizeShortcutBinding(binding)
    .split('+')
    .map(token=>token==='Mod'?(apple?'⌘':'Ctrl'):token==='Alt'&&apple?'⌥':token==='Shift'&&apple?'⇧':token)
    .join(apple?' ':' + ');
}

export function shortcutConflicts(bindings:Record<ShortcutAction,string>,action:ShortcutAction,binding:string){
  const normalized=normalizeShortcutBinding(binding);
  if(!normalized)return undefined;
  return SHORTCUT_DEFINITIONS.find(item=>item.action!==action&&normalizeShortcutBinding(bindings[item.action])===normalized)?.action;
}
