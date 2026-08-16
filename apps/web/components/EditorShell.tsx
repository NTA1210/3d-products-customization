'use client';

import { useMemo, useRef, useState } from 'react';
import type {
  ComponentRole,
  DependencyRule,
  MaterialCategory,
  ScalingMode,
} from '@product3d/model-schema';
import {
  ComponentRole as ComponentRoleSchema,
  DependencyRuleSchema,
  MaterialCategory as MaterialCategorySchema,
  ModelManifestSchema,
  ScalingMode as ScalingModeSchema,
} from '@product3d/model-schema';
import { fromMm, toMm, type LengthUnit } from '@product3d/constraint-engine';
import { z } from 'zod';
import AuthPanel from './AuthPanel';
import ModelViewport from './ModelViewport';
import StyleVariantTools from './StyleVariantTools';
import WorkspaceControls from './WorkspaceControls';
import { useAuthStore } from '../lib/auth-store';
import { useEditorStore } from '../lib/store';
import { demoMaterials } from '../lib/materials';
import {
  loadAssetManifest,
  saveAssetManifest,
  startAssetPipeline,
  type AssetPipelineStatus,
} from '../lib/asset-api';

const roles = ComponentRoleSchema.options as ComponentRole[];
const materialCategories = MaterialCategorySchema.options as MaterialCategory[];
const scalingModes = ScalingModeSchema.options as ScalingMode[];

function downloadJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function AssetPreparation() {
  const {
    manifest,
    analysis,
    assetId,
    configuration,
    selected,
    patchComponentDefinition,
    setRole,
    setDependencies,
    setPrepareVisibility,
    openEditor,
  } = useEditorStore();
  const [saving, setSaving] = useState(false);

  if (!manifest) return <p className="muted">Preparing manifest…</p>;
  const component = manifest.components.find((item) => item.id === selected);
  if (!component) return <p className="muted">Select a component candidate.</p>;

  const candidate = analysis?.componentCandidates.find((item) => item.id === component.id);
  const componentState = configuration?.components[component.id];
  const showRegionMapping =
    analysis?.stats.meshes === 1 && Boolean(candidate && candidate.regionIds.length > 1);

  const setAxis = (axis: 'x' | 'y' | 'z', checked: boolean) => {
    patchComponentDefinition(component.id, {
      editableAxes: { ...component.editableAxes, [axis]: checked },
      scalingMode:
        checked && component.scalingMode === 'FIXED' ? 'AXIS_SCALE' : component.scalingMode,
    });
  };

  const setRange = (
    dimension: 'width' | 'height' | 'depth',
    bound: 'min' | 'max',
    raw: string,
  ) => {
    const next = { ...(component.constraints[dimension] ?? {}) };
    if (raw === '') delete next[bound];
    else next[bound] = Number(raw);
    patchComponentDefinition(component.id, {
      constraints: {
        ...component.constraints,
        [dimension]: Object.keys(next).length ? next : null,
      },
    });
  };

  const toggleCategory = (category: MaterialCategory, checked: boolean) => {
    const current = component.allowedMaterialCategories ?? [];
    patchComponentDefinition(component.id, {
      allowedMaterialCategories: checked
        ? [...new Set([...current, category])]
        : current.filter((item) => item !== category),
    });
  };

  const save = async () => {
    if (!assetId) return;
    setSaving(true);
    try {
      await saveAssetManifest(assetId, manifest);
      openEditor();
    } catch (error) {
      useEditorStore.setState({
        error: error instanceof Error ? error.message : 'Could not save manifest.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="eyebrow">Asset Preparation</div>
      <p className="hint">
        UNKNOWN / fixed is the safe default. Mark only the components you want to customize as
        Editable, then choose their allowed axes and constraints.
      </p>
      <label>Name</label>
      <input
        value={component.name}
        onChange={(event) => patchComponentDefinition(component.id, { name: event.target.value })}
      />

      <label>Role</label>
      <select
        value={component.role}
        onChange={(event) => setRole(component.id, event.target.value as ComponentRole)}
      >
        {roles.map((role) => (
          <option key={role}>{role}</option>
        ))}
      </select>

      <label>Scaling</label>
      <select
        value={component.scalingMode}
        onChange={(event) =>
          patchComponentDefinition(component.id, { scalingMode: event.target.value as ScalingMode })
        }
      >
        {scalingModes.map((mode) => (
          <option key={mode}>{mode}</option>
        ))}
      </select>

      <label className="check">
        <input
          type="checkbox"
          checked={component.editable}
          onChange={(event) =>
            patchComponentDefinition(component.id, { editable: event.target.checked })
          }
        />
        Editable
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={componentState?.visible ?? true}
          onChange={(event) => setPrepareVisibility(component.id, event.target.checked)}
        />
        Visible
      </label>

      <div className="field-group">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <label className="check inline" key={axis}>
            <input
              type="checkbox"
              disabled={!component.editable}
              checked={component.editableAxes[axis]}
              onChange={(event) => setAxis(axis, event.target.checked)}
            />
            {axis.toUpperCase()}
          </label>
        ))}
      </div>

      {(['width', 'height', 'depth'] as const).map((dimension) => (
        <div key={dimension}>
          <label>{dimension} min/max mm</label>
          <div className="row">
            <input
              type="number"
              value={component.constraints[dimension]?.min ?? ''}
              onChange={(event) => setRange(dimension, 'min', event.target.value)}
            />
            <input
              type="number"
              value={component.constraints[dimension]?.max ?? ''}
              onChange={(event) => setRange(dimension, 'max', event.target.value)}
            />
          </div>
        </div>
      ))}

      <label>Anchor IDs</label>
      <input
        value={component.anchorIds.join(', ')}
        onChange={(event) =>
          patchComponentDefinition(component.id, {
            anchorIds: event.target.value
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean),
          })
        }
      />

      <label>Variant group</label>
      <input
        value={component.variantGroupId ?? ''}
        onChange={(event) =>
          patchComponentDefinition(component.id, {
            variantGroupId: event.target.value || undefined,
          })
        }
      />

      <div className="field-group">
        {materialCategories.map((category) => (
          <label className="check" key={category}>
            <input
              type="checkbox"
              checked={component.allowedMaterialCategories?.includes(category) ?? false}
              onChange={(event) => toggleCategory(category, event.target.checked)}
            />
            {category}
          </label>
        ))}
      </div>

      {showRegionMapping && candidate && (
        <div className="warning">
          Single-mesh asset: {candidate.regionIds.length} disconnected geometry region(s) are
          available as preparation candidates.{' '}
          <button
            onClick={() =>
              patchComponentDefinition(component.id, { sourceRegionIds: candidate.regionIds })
            }
          >
            Map all
          </button>
        </div>
      )}

      <label>Dependencies JSON</label>
      <textarea
        rows={5}
        defaultValue={JSON.stringify(manifest.dependencies, null, 2)}
        onBlur={(event) => {
          try {
            setDependencies(
              z.array(DependencyRuleSchema).parse(JSON.parse(event.target.value)) as DependencyRule[],
            );
          } catch {
            useEditorStore.setState({ error: 'Dependency JSON is invalid.' });
          }
        }}
      />

      <button className="primary full" disabled={!assetId || saving} onClick={() => void save()}>
        {saving ? 'Saving…' : 'Save Manifest & Open Editor'}
      </button>
    </>
  );
}

function Inspector() {
  const store = useEditorStore();
  const [unit, setUnit] = useState<LengthUnit>('mm');
  const definition = store.manifest?.components.find((item) => item.id === store.selected);
  const state = store.selected ? store.configuration?.components[store.selected] : undefined;

  if (!store.configuration) return <p className="muted">Upload a GLB model.</p>;

  if (!store.configuration.placement.locked) {
    return (
      <>
        <div className="eyebrow">Placement</div>
        <div className="segmented">
          <button
            className={store.placementMode === 'translate' ? 'active' : ''}
            onClick={() => store.setPlacementMode('translate')}
          >
            Move
          </button>
          <button
            className={store.placementMode === 'rotate' ? 'active' : ''}
            onClick={() => store.setPlacementMode('rotate')}
          >
            Rotate
          </button>
        </div>
        <button className="primary full" onClick={store.toggleLock}>
          Lock placement
        </button>
      </>
    );
  }

  if (!definition || !state) {
    return (
      <>
        <StyleVariantTools />
        <p className="muted">Select a component.</p>
      </>
    );
  }

  const dimension = (axis: 'WIDTH' | 'HEIGHT' | 'DEPTH', value: number) =>
    store.dispatch(
      {
        type: 'SET_DIMENSION',
        componentId: definition.id,
        axis,
        valueMm: toMm(value, unit),
        source: 'MANUAL',
      },
      `Set ${axis.toLowerCase()}`,
    );

  return (
    <>
      <StyleVariantTools />
      <div className="row">
        <div className="eyebrow">Inspector</div>
        <select value={unit} onChange={(event) => setUnit(event.target.value as LengthUnit)}>
          <option value="mm">mm</option>
          <option value="cm">cm</option>
          <option value="inch">inch</option>
        </select>
      </div>
      <h3>{definition.name}</h3>

      {(['WIDTH', 'HEIGHT', 'DEPTH'] as const).map((axis) => {
        const key = axis.toLowerCase() as 'width' | 'height' | 'depth';
        const mapped = store.manifest!.axisMapping[key];
        const enabled =
          definition.editable &&
          definition.editableAxes[mapped] &&
          definition.scalingMode === 'AXIS_SCALE';
        return (
          <div key={axis}>
            <label>
              {axis} ({unit})
            </label>
            <input
              type="number"
              disabled={!enabled}
              value={Math.round(fromMm(state.dimensionsMm[key], unit) * 1000) / 1000}
              onChange={(event) => dimension(axis, Number(event.target.value))}
            />
          </div>
        );
      })}

      <div className="field-group">
        <span className="muted">Position ({unit})</span>
        {(['X', 'Y', 'Z'] as const).map((axis, index) => (
          <div key={axis}>
            <label>{axis}</label>
            <input
              type="number"
              disabled={!definition.editable}
              value={Math.round(fromMm(state.transform.position[index], unit) * 1000) / 1000}
              onChange={(event) =>
                store.dispatch(
                  {
                    type: 'SET_POSITION',
                    componentId: definition.id,
                    axis,
                    value: toMm(Number(event.target.value), unit),
                    source: 'MANUAL',
                  },
                  `Move ${axis}`,
                )
              }
            />
          </div>
        ))}
      </div>

      <div className="field-group">
        <span className="muted">Rotation (degrees)</span>
        {(['X', 'Y', 'Z'] as const).map((axis, index) => (
          <div key={axis}>
            <label>{axis}</label>
            <input
              type="number"
              disabled={!definition.editable}
              value={Math.round((state.transform.rotation[index] * 180 * 100) / Math.PI) / 100}
              onChange={(event) =>
                store.dispatch(
                  {
                    type: 'SET_ROTATION',
                    componentId: definition.id,
                    axis,
                    value: (Number(event.target.value) * Math.PI) / 180,
                    source: 'MANUAL',
                  },
                  `Rotate ${axis}`,
                )
              }
            />
          </div>
        ))}
      </div>

      <label>Material</label>
      <select
        disabled={!definition.editable}
        value={state.materialId ?? ''}
        onChange={(event) =>
          event.target.value &&
          store.dispatch(
            {
              type: 'SET_MATERIAL',
              componentId: definition.id,
              materialId: event.target.value,
              source: 'MANUAL',
            },
            'Change material',
          )
        }
      >
        <option value="">Original</option>
        {demoMaterials.map((material) => (
          <option key={material.id} value={material.id}>
            {material.name}
          </option>
        ))}
      </select>

      <label>Color</label>
      <input
        disabled={!definition.editable}
        type="color"
        value={state.color ?? '#b8895b'}
        onChange={(event) =>
          store.dispatch(
            {
              type: 'SET_COLOR',
              componentId: definition.id,
              color: event.target.value,
              source: 'MANUAL',
            },
            'Change color',
          )
        }
      />

      <div className="row">
        <button
          onClick={() =>
            store.dispatch(
              { type: 'RESET_COMPONENT', componentId: definition.id, source: 'MANUAL' },
              'Reset component',
            )
          }
        >
          Reset
        </button>
        {state.deleted ? (
          <button
            onClick={() =>
              store.dispatch(
                { type: 'RESTORE_COMPONENT', componentId: definition.id, source: 'MANUAL' },
                'Restore component',
              )
            }
          >
            Restore
          </button>
        ) : (
          <button
            onClick={() =>
              store.dispatch(
                { type: 'DELETE_COMPONENT', componentId: definition.id, source: 'MANUAL' },
                'Delete component',
              )
            }
          >
            Delete
          </button>
        )}
        <button onClick={store.toggleLock}>Unlock</button>
      </div>
    </>
  );
}

export default function EditorShell() {
  const store = useEditorStore();
  const auth = useAuthStore();
  const [pipeline, setPipeline] = useState<AssetPipelineStatus>('idle');
  const abort = useRef<AbortController | null>(null);
  const selected = store.manifest?.components.find((item) => item.id === store.selected);
  const canUndo = store.undoStack.length > 0;
  const canRedo = store.redoStack.length > 0;
  const status = useMemo(
    () =>
      store.phase === 'EMPTY'
        ? 'No asset'
        : store.phase === 'PREPARE'
          ? 'Asset Preparation'
          : store.configuration?.placement.locked
            ? 'Locked · Customize'
            : 'Unlocked · Place',
    [store.phase, store.configuration?.placement.locked],
  );
  const visibleWarnings =
    store.analysis?.warnings.filter((warning) => warning.severity !== 'INFO').slice(0, 3) ?? [];
  const infoNoteCount =
    store.analysis?.warnings.filter((warning) => warning.severity === 'INFO').length ?? 0;

  const upload = async (file?: File) => {
    if (!file) return;
    if (!auth.user) {
      useEditorStore.setState({ error: 'Sign in before importing an asset.' });
      return;
    }
    if (!file.name.toLowerCase().endsWith('.glb')) {
      useEditorStore.setState({ error: 'Phase 1 accepts GLB.' });
      return;
    }
    abort.current?.abort();
    abort.current = new AbortController();
    if (store.assetUrl?.startsWith('blob:')) URL.revokeObjectURL(store.assetUrl);
    store.setUploadedAsset(file.name, URL.createObjectURL(file));
    try {
      const result = await startAssetPipeline(file, setPipeline, abort.current.signal);
      store.setAssetAnalysis(result.assetId, result.analysis);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setPipeline('failed');
      useEditorStore.setState({
        error: error instanceof Error ? error.message : 'Asset pipeline failed.',
      });
    }
  };

  const importManifest = async (file?: File) => {
    if (!file) return;
    try {
      store.replaceManifest(ModelManifestSchema.parse(JSON.parse(await file.text())));
    } catch (error) {
      useEditorStore.setState({
        error: error instanceof Error ? error.message : 'Invalid manifest.',
      });
    }
  };

  const reloadManifest = async () => {
    if (!store.assetId) return;
    try {
      store.replaceManifest(await loadAssetManifest(store.assetId));
    } catch (error) {
      useEditorStore.setState({
        error: error instanceof Error ? error.message : 'Could not reload.',
      });
    }
  };

  return (
    <div className="shell">
      <header className="top">
        <div>
          <strong>3D Product Configurator</strong>
          <AuthPanel />
        </div>
        <div className="top-actions">
          <WorkspaceControls />
          <label className="upload">
            Import GLB
            <input
              disabled={!auth.user}
              type="file"
              accept=".glb"
              onChange={(event) => void upload(event.target.files?.[0])}
            />
          </label>
          {store.phase === 'PREPARE' && (
            <label className="upload">
              Import Manifest
              <input
                type="file"
                accept=".json"
                onChange={(event) => void importManifest(event.target.files?.[0])}
              />
            </label>
          )}
          <button disabled={!store.assetId} onClick={() => void reloadManifest()}>
            Reload Manifest
          </button>
          <button disabled={!canUndo} onClick={store.undo}>
            Undo
          </button>
          <button disabled={!canRedo} onClick={store.redo}>
            Redo
          </button>
          <button
            disabled={!store.configuration}
            onClick={() =>
              store.configuration &&
              downloadJson(`${store.assetName ?? 'product'}.configuration.json`, {
                manifest: store.manifest,
                configuration: store.configuration,
              })
            }
          >
            Configuration JSON
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="panel">
          <div className="eyebrow">Components</div>
          {visibleWarnings.map((warning) => (
            <div className="warning" key={warning.code + warning.sourceId}>
              {warning.message}
            </div>
          ))}
          {infoNoteCount > 0 && (
            <p className="hint">
              {infoNoteCount} non-blocking model note(s) hidden. Asset status “ready” means GLB
              validation and preparation completed successfully.
            </p>
          )}
          {store.manifest?.components.map((component) => (
            <button
              key={component.id}
              className={`component-card ${store.selected === component.id ? 'active' : ''}`}
              onClick={() => store.select(component.id)}
            >
              <span>{component.name}</span>
              <small>
                {component.role} · {component.editable ? 'editable' : 'fixed'}
                {store.configuration?.components[component.id]?.deleted ? ' · deleted' : ''}
              </small>
            </button>
          ))}
        </aside>

        <main className="viewer">
          <ModelViewport />
        </main>

        <aside className="panel right">
          {store.phase === 'PREPARE' ? <AssetPreparation /> : <Inspector />}
          {store.error && (
            <div className="error" onClick={store.clearError}>
              {store.error}
            </div>
          )}
          {selected && (
            <p className="source-id">
              {selected.sourceNodeIds[0]} / {selected.sourceMeshIds[0]}
            </p>
          )}
        </aside>
      </div>

      <footer className="status">
        <span className={`dot ${store.configuration?.placement.locked ? 'ok' : ''}`} />
        {status}
        <span>Asset: {pipeline}</span>
        {store.projectId && <span>Project: {store.projectId.slice(0, 8)}</span>}
        {store.configuration?.appliedStyleId && (
          <span>Style: {store.configuration.appliedStyleId}</span>
        )}
        <span>Canonical: mm</span>
      </footer>
    </div>
  );
}
