import {describe,expect,it} from 'vitest';
import {
  DEFAULT_SHORTCUT_BINDINGS,
  SHORTCUT_PRESETS,
  normalizeShortcutBinding,
  shortcutConflicts,
  shortcutFromEvent,
  shortcutMatches,
} from './keyboard-shortcuts';

describe('keyboard shortcut model',()=>{
  it('normalizes Ctrl/Cmd into the cross-platform Mod modifier',()=>{
    expect(normalizeShortcutBinding('Ctrl+z')).toBe('Mod+Z');
    expect(normalizeShortcutBinding('Command + Shift + z')).toBe('Mod+Shift+Z');
  });

  it('maps keyboard events to deterministic bindings',()=>{
    const undo={key:'z',ctrlKey:true,metaKey:false,altKey:false,shiftKey:false};
    const macUndo={...undo,ctrlKey:false,metaKey:true};
    const redo={...undo,key:'Z',shiftKey:true};
    expect(shortcutFromEvent(undo)).toBe('Mod+Z');
    expect(shortcutFromEvent(macUndo)).toBe('Mod+Z');
    expect(shortcutFromEvent(redo)).toBe('Mod+Shift+Z');
    expect(shortcutMatches(undo,'Mod+Z')).toBe(true);
  });

  it('detects collisions before a binding is reassigned',()=>{
    expect(shortcutConflicts(DEFAULT_SHORTCUT_BINDINGS,'toggleSnap','L')).toBe('toggleLabels');
    expect(shortcutConflicts(DEFAULT_SHORTCUT_BINDINGS,'toggleSnap','Alt+S')).toBeUndefined();
  });

  it('ships a Maya-style standard DCC keymap with explicit framing, snap and attach',()=>{
    expect(SHORTCUT_PRESETS.maya.move).toBe('W');
    expect(SHORTCUT_PRESETS.maya.rotate).toBe('E');
    expect(SHORTCUT_PRESETS.maya.scale).toBe('R');
    expect(SHORTCUT_PRESETS.maya.focusSelected).toBe('F');
    expect(SHORTCUT_PRESETS.maya.frameAll).toBe('Home');
    expect(SHORTCUT_PRESETS.maya.toggleGridSnap).toBe('X');
    expect(SHORTCUT_PRESETS.maya.toggleSnap).toBe('S');
    expect(SHORTCUT_PRESETS.maya.toggleAttach).toBe('J');
  });

  it('offers a Blender-style transform preset without colliding scale and anchor snap',()=>{
    expect(SHORTCUT_PRESETS.blender.move).toBe('G');
    expect(SHORTCUT_PRESETS.blender.rotate).toBe('R');
    expect(SHORTCUT_PRESETS.blender.scale).toBe('S');
    expect(SHORTCUT_PRESETS.blender.toggleSnap).toBe('Shift+Tab');
    expect(SHORTCUT_PRESETS.blender.toggleAttach).toBe('J');
    expect(shortcutConflicts(SHORTCUT_PRESETS.blender,'scale',SHORTCUT_PRESETS.blender.scale)).toBeUndefined();
  });

  it('matches non-character framing keys',()=>{
    const home={key:'Home',ctrlKey:false,metaKey:false,altKey:false,shiftKey:false};
    expect(shortcutMatches(home,'Home')).toBe(true);
  });
});
