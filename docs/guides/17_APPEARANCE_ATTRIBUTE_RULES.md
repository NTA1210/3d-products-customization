# Component Attributes and Appearance Rules

This editor separates **what a component is** from **which appearance properties should stay synchronized**.

Do not use component names, `styleTags`, hierarchy, or exact label equality as the synchronization contract. The contract is stored in the Manifest as component `attributes` plus model-level `appearanceRules`.

## Component attributes

Attributes are semantic key/value metadata on each component.

Example:

```json
{
  "part": "wing",
  "side": "left",
  "section": "primary",
  "surface": "exterior"
}
```

The mirrored component may be:

```json
{
  "part": "wing",
  "side": "right",
  "section": "primary",
  "surface": "exterior"
}
```

Keys and values are normalized case-insensitively by the runtime matcher.

In Asset Preparation, enter attributes as comma-separated `key=value` pairs, for example:

```text
part=wing, side=left, section=primary
```

## Appearance rules

An Appearance Rule describes a subset match and the appearance channels it synchronizes.

Example:

```json
{
  "id": "wing-surface",
  "name": "Wing Surface",
  "match": {
    "part": "wing"
  },
  "syncChannels": ["MATERIAL", "COLOR"],
  "enabled": true
}
```

`match` uses subset semantics. A rule with only `part=wing` matches both left and right wings even though their `side` attributes differ.

A more specific rule can coexist:

```json
{
  "id": "left-wing-marking",
  "name": "Left Wing Marking",
  "match": {
    "part": "wing",
    "side": "left"
  },
  "syncChannels": ["COLOR"],
  "enabled": true
}
```

The first rule matches both wings. The second matches only the left wing.

## Multiple rules per component

A component may match multiple rules at the same time.

For example, the left wing can match:

- `Wing Surface`: `part=wing` → Material + Color.
- `Aircraft Exterior Paint`: `surface=exterior` → Color.
- `Left Wing Marking`: `part=wing, side=left` → Color.

When the designer manually edits a channel, the editor uses only the rules matched by the **source component** that include that channel. Targets are the union of members of those source rules.

Propagation is deliberately not transitive through rules that are matched only by a target component. This prevents a target from unexpectedly expanding the edit into unrelated groups.

## Channels

Current synchronized appearance channels are:

- `MATERIAL`
- `COLOR`

The following remain independent even when components match the same Appearance Rule:

- Position
- Rotation
- Dimensions / Resize
- Variant geometry
- Visibility
- Delete / Restore
- Attachments

Variant replacement is excluded because mirrored components may share appearance semantics while requiring different left/right geometry assets.

## Atomic validation

A synchronized Material or Color edit is one editor transaction.

Every generated action still goes through the normal Action / Constraint / Compatibility pipeline. If any matched component rejects the requested material, the complete synchronized edit fails and no component is partially changed.

Undo/Redo treats one synchronized edit as one history entry.

## Empty rules are safe

An enabled Appearance Rule with an empty `match` object matches no components. It never means “match the entire model”. This makes incremental rule authoring safe.

## Legacy exact labels

The previous `labels` field remains optional in the schema so saved Manifest JSON can still be read. Legacy labels no longer control synchronization.

Do not add new synchronization logic based on exact label equality. New authoring should use `attributes` + `appearanceRules`.

## Main implementation files

- `packages/model-schema/src/index.ts` — `attributes`, `AppearanceRule`, sync channel schema.
- `apps/web/lib/appearance-rules.ts` — normalization, matching, target resolution and action expansion.
- `apps/web/lib/store.ts` — atomic manual Material/Color synchronization.
- `apps/web/components/SnapViewportHud.tsx` — Attribute/Appearance Rule authoring and runtime status.
- `tests/appearance-rules.test.ts` — matching semantics.
- `apps/web/lib/store-appearance-rules.test.ts` — store transaction and compatibility behavior.
