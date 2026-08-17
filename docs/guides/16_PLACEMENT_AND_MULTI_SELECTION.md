# Placement and Multi-Selection Workflow

## Placement before Lock

The model placement step controls the complete imported asset before component customization begins.

The placement gizmo is centered on the visible model bounds rather than trusting the source GLB origin. This matters because authoring tools may export a model whose root origin is far away from its visible geometry.

- `W` / Move — move the complete model.
- `E` / Rotate — rotate the complete model around the visible model center.
- Right Mouse drag — orbit camera.
- Middle Mouse drag — pan camera.
- Mouse wheel — zoom.
- `Alt + Left/Middle/Right Mouse` — Maya-style orbit/pan/dolly.
- **Lock placement** — commit the placement workflow and enter component editing.

## Selecting multiple components

Multi-selection is transient editor UI state. It is not stored in the Manifest or Configuration.

After placement is locked:

1. Left click a component for a normal single selection.
2. Hold `Shift` and left click another component to add it.
3. Shift-click a selected component again to remove it from the selection.
4. A purple combined-bounds indicator shows the active group.

The last selected item remains the primary component for the Inspector, while the shared transform gizmo represents the complete selection.

## Group transform

### Move

Press `W` and drag the shared gizmo. All selected editable components move together and the result is committed as one history transaction.

### Rotate

Press `E` and rotate the shared gizmo. Components rotate around the combined selection center. Their positions and rotations are committed together.

### Scale

Group Scale is intentionally disabled for now. Product dimensions are constrained per component through Manifest scaling modes, editable axes, and dimension limits. A generic scene-level scale would bypass those product rules.

## Attachments

Runtime components stay flat in the Three.js scene. Multi-selection never permanently reparents component meshes.

If an attachment exists between two components that are both in the active selection, the group transform restores that internal attachment after committing the component transforms. This keeps assembly state intact while still using deterministic configuration actions.

Moving an attached child without its target retains the existing single-component behavior: direct movement is treated as intentional separation and may detach it.

## Snap behavior

Semantic Anchor Snap is disabled while multiple components are selected because there is no unambiguous active source anchor for a group. Return to a single selected component before using temporary Snap, persistent Snap, or Attach mode.

## Recommended designer flow

1. Import and prepare the asset.
2. Open Editor.
3. Use the centered placement gizmo to place/rotate the complete model.
4. Lock placement.
5. Single-click for detailed component work.
6. Shift-click several editable components for a group operation.
7. Use `W` or `E` on the shared group gizmo.
8. Return to a single selection for Anchor Snap, Attach, material, color, or dimension editing.
