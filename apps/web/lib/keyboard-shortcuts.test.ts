import {describe,expect,it} from 'vitest';
import {
  DEFAULT_SHORTCUT_BINDINGS,
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
});
