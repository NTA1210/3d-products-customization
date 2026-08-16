'use client';

import {useState} from 'react';
import {fromMm,type LengthUnit} from '@product3d/constraint-engine';
import {useEditorStore} from '../lib/store';
import {useMeasurementStore,type RuntimeMeasurement} from '../lib/measurement-store';

function value(mm:number|undefined,unit:LengthUnit){
  if(mm===undefined||!Number.isFinite(mm))return '—';
  const converted=fromMm(mm,unit);
  const digits=unit==='mm'?1:unit==='cm'?2:3;
  return converted.toLocaleString(undefined,{maximumFractionDigits:digits});
}

function Dimensions({measurement,unit}:{measurement?:RuntimeMeasurement;unit:LengthUnit}){
  return <div className="measure-grid">
    <div className="measure-cell"><span>W · X</span><strong>{value(measurement?.widthMm,unit)}</strong><small>{unit}</small></div>
    <div className="measure-cell"><span>H · Y</span><strong>{value(measurement?.heightMm,unit)}</strong><small>{unit}</small></div>
    <div className="measure-cell"><span>D · Z</span><strong>{value(measurement?.depthMm,unit)}</strong><small>{unit}</small></div>
  </div>;
}

function ConfiguredDimensions({values,unit}:{values?:{width:number;height:number;depth:number};unit:LengthUnit}){
  return <div className="measure-grid compact-measure-grid">
    <div className="measure-cell"><span>W</span><strong>{value(values?.width,unit)}</strong><small>{unit}</small></div>
    <div className="measure-cell"><span>H</span><strong>{value(values?.height,unit)}</strong><small>{unit}</small></div>
    <div className="measure-cell"><span>D</span><strong>{value(values?.depth,unit)}</strong><small>{unit}</small></div>
  </div>;
}

function Vector({label,values,unit}:{label:string;values?:readonly number[];unit:LengthUnit}){
  return <div className="measure-vector">
    <span>{label}</span>
    <code>X {value(values?.[0],unit)} · Y {value(values?.[1],unit)} · Z {value(values?.[2],unit)} {unit}</code>
  </div>;
}

export default function MeasurementPanel(){
  const[unit,setUnit]=useState<LengthUnit>('mm');
  const model=useMeasurementStore(state=>state.model);
  const selectedRuntime=useMeasurementStore(state=>state.selected);
  const selected=useEditorStore(state=>state.selected);
  const definition=useEditorStore(state=>state.manifest?.components.find(item=>item.id===state.selected));
  const component=useEditorStore(state=>state.selected?state.configuration?.components[state.selected]:undefined);
  const runtime=selectedRuntime?.componentId===selected?selectedRuntime:undefined;

  return <div className="customization-card measurements-card" data-testid="measurements-panel">
    <div className="measure-heading">
      <div><div className="eyebrow">Measurements</div><strong>Model & component</strong></div>
      <select aria-label="Measurement unit" value={unit} onChange={event=>setUnit(event.target.value as LengthUnit)}>
        <option value="mm">mm</option><option value="cm">cm</option><option value="inch">inch</option>
      </select>
    </div>

    <div className="measure-section">
      <span className="measure-title">Overall model envelope</span>
      <Dimensions measurement={model} unit={unit}/>
      <p className="hint compact-hint">Bounding box của toàn bộ part đang visible, theo trục X/Y/Z của model và không tính placement ngoài scene.</p>
    </div>

    {definition&&component&&<div className="measure-section selected-measure-section">
      <span className="measure-title">Selected · {definition.name}</span>
      <span className="measure-subtitle">Configured size</span>
      <ConfiguredDimensions values={component.dimensionsMm} unit={unit}/>
      <span className="measure-subtitle">Current envelope after transform</span>
      <Dimensions measurement={runtime} unit={unit}/>
      <Vector label="Center from model origin" values={runtime?.centerMm} unit={unit}/>
      <Vector label="Edit offset" values={component.transform.position} unit={unit}/>
      <details className="measure-details"><summary>Original / min / max</summary>
        <span className="measure-subtitle">Original size</span>
        <ConfiguredDimensions values={component.originalDimensionsMm} unit={unit}/>
        <Vector label="Envelope min" values={runtime?.minMm} unit={unit}/>
        <Vector label="Envelope max" values={runtime?.maxMm} unit={unit}/>
      </details>
    </div>}
  </div>;
}
