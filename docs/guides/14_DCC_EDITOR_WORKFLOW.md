# DCC Editor Workflow

This guide describes the editor interaction model after the DCC workflow pass. The goal is not to clone Maya or Blender feature-for-feature. The goal is to keep the interaction conventions that make professional 3D tools fast: stable camera state, explicit framing, navigation modifiers, hotkey-first transforms, local/world space, numeric channels, precision snapping, visibility isolation, and configurable keymaps.

## 1. Core interaction model

Selecting a component must not move the camera. A click only changes selection.

Use explicit framing when you want the camera to move:

- `F` — Frame selected component.
- `Home` — Frame the complete model.

This prevents the viewport from fighting the user while repeatedly selecting and adjusting nearby parts.

## 2. Viewport navigation

Mouse navigation is separated from normal left-click selection:

- `Alt + Left Mouse` — Orbit / tumble.
- `Alt + Middle Mouse` — Pan / track.
- `Alt + Right Mouse` — Dolly.
- Mouse wheel — Zoom at any time.

While Alt navigation is active, clicking geometry does not change the selected component and clicking empty space does not clear the selection.

## 3. Maya / Standard DCC keymap

The default keymap is optimized for the existing editor and common DCC muscle memory:

| Action | Shortcut |
| --- | --- |
| Undo | Ctrl/Cmd + Z |
| Redo | Ctrl/Cmd + Shift + Z |
| Move | W |
| Rotate | E |
| Scale / Resize | R |
| Frame selected | F |
| Frame all | Home |
| Grid transform snap | X |
| Hide selected | H |
| Isolate selected | Shift + H |
| Show all | Alt + H |
| Anchor magnetic snap | S |
| Component labels | L |
| Delete component | Delete |
| Increase / decrease gizmo | = / - |

All shortcuts remain editable from **Keymap** in the viewport toolbar.

## 4. Blender-style preset

Open **Keymap → Blender style** when G/R/S transform muscle memory is preferred.

The preset maps:

- Move → `G`
- Rotate → `R`
- Scale → `S`
- Anchor magnetic snap → `Shift + Tab`

This is deliberately called *Blender style*, not a complete Blender keymap. Product-specific actions such as semantic Anchor Snap remain separate from generic transform snapping.

## 5. World and Local transform space

The viewport toolbar exposes **World / Local**.

- **World**: gizmo axes stay aligned with the editor/world axes.
- **Local**: gizmo axes follow the selected component orientation.

Use Local when adjusting a rotated wing, leg, handle, panel, or other part along its own axes.

## 6. Grid transform snap vs Anchor Snap

These are intentionally different systems.

### Grid transform snap

Grid Snap controls exact transform increments:

- Translation step is configured in millimetres.
- Rotation step is configured in degrees.
- The default is 100 mm translation / 15° rotation.

Use this for precise regular placement.

### Anchor magnetic snap

Anchor Snap uses Manifest anchor semantics and compatibility to connect meaningful component locations.

Use this for assembly relationships such as a leg socket, wing mount, engine mount, handle mount, or other semantic connection.

Keeping the two snap systems separate avoids a generic grid rule accidentally replacing product assembly logic.

## 7. Channel Box

After **Lock placement**, selecting an editable component opens a compact Channel Box over the viewport.

It exposes exact values for:

- Position X/Y/Z in mm.
- Rotation X/Y/Z in degrees.
- Width/Height/Depth in mm.

Numeric edits commit on Enter or when the field loses focus. Typing intermediate digits does not create multiple Undo entries.

Dimension fields respect the Manifest `axisMapping`, `editableAxes`, and scaling mode.

## 8. Visibility workflow

Complex models are easier to edit when unrelated geometry can be temporarily removed from view.

- `H` hides the selected component.
- `Shift + H` isolates the selected component.
- `Alt + H` restores visibility for every component that has not been deleted.

These operations use `SET_VISIBILITY` actions and therefore participate in Undo/Redo. They do not mutate the source GLB.

## 9. Soft ground barrier

The existing Y=0 soft barrier remains active while translating components.

It is an interaction aid rather than a hard model constraint:

1. The real component bounding-box bottom reaches the ground plane.
2. The drag briefly resists crossing below the grid.
3. Continuing the drag intentionally releases the barrier.
4. The component may then move below Y=0.

## 10. Gizmo size

Use the `- / +` controls in the viewport toolbar when the transform manipulator is too large or too small for the current zoom level/model scale.

The preference is stored locally for the browser.

## 11. State ownership

DCC interaction preferences such as transform space, grid snap step, gizmo size, and keymap live in browser-side UI stores.

Actual product changes still flow through the editor action engine and Model Configuration. The viewport remains a view/controller; it is not the source of truth for product state.

## 12. Recommended editing sequence

For a typical part adjustment:

1. Click the component to select it.
2. Use `Alt + mouse` to navigate without changing selection.
3. Press `F` only if you need to reframe it.
4. Choose `W`, `E`, or `R`.
5. Select World or Local space.
6. Enable `X` Grid Snap for regular increments when needed.
7. Use `S` Anchor Snap when assembling compatible parts.
8. Use the Channel Box for exact final values.
9. Use `H / Shift+H / Alt+H` to control visual clutter.
10. Undo/Redo with Ctrl/Cmd + Z and Ctrl/Cmd + Shift + Z.

## 13. Next DCC capabilities

The next logical capabilities, if required by product workflows, are:

- Multi-selection and group transforms.
- Box/lasso selection.
- User-editable pivots.
- Orthographic Front / Side / Top view shortcuts.
- Viewport maximize / restore.
- Duplicate component workflow where the product schema allows new instances.

Those features require explicit product-state semantics and should not be simulated by re-parenting Three.js objects.
