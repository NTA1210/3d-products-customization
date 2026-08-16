import {describe,expect,it} from 'vitest';
import {MetricsService} from '../apps/api/src/metrics/metrics.controller';

function date(seconds:number){return new Date(seconds*1000);}

const db={
  modelAsset:{findMany:async()=>[
    {status:'READY',createdAt:date(0),updatedAt:date(5),analysisJson:{stats:{triangles:1200}}},
    {status:'FAILED',createdAt:date(10),updatedAt:date(12),analysisJson:null},
  ]},
  job:{findMany:async()=>[
    {type:'ASSET_ANALYZE_NORMALIZE',status:'COMPLETED',createdAt:date(0),updatedAt:date(4)},
    {type:'EXPORT_GLB',status:'COMPLETED',createdAt:date(4),updatedAt:date(6)},
    {type:'RENDER_PREVIEW',status:'FAILED',createdAt:date(7),updatedAt:date(10)},
  ]},
  aIRequest:{findMany:async()=>[
    {type:'DESIGN_SUGGEST',status:'COMPLETED'},
    {type:'DESIGN_SUGGEST',status:'FAILED'},
  ]},
  manufacturingCheck:{findMany:async()=>[{status:'COMPLETED'}]},
  renderJob:{findMany:async()=>[{mode:'PREVIEW',quality:'MEDIUM'}]},
};

describe('Prometheus metrics exposition',()=>{
  it('derives persisted job/asset metrics and includes authenticated viewer timing',async()=>{
    const metrics=new MetricsService();
    metrics.recordViewerLoad(1250);
    const text=await metrics.render(db as never);

    expect(text).toContain('# TYPE product3d_asset_total gauge');
    expect(text).toContain('product3d_asset_total{status="READY"} 1');
    expect(text).toContain('asset_import_duration_seconds_sum 7');
    expect(text).toContain('asset_analysis_duration_seconds_sum 4');
    expect(text).toContain('export_duration_seconds_sum 2');
    expect(text).toContain('render_duration_seconds_sum 3');
    expect(text).toContain('ai_request_count{type="DESIGN_SUGGEST",status="FAILED"} 1');
    expect(text).toContain('ai_request_failure{type="DESIGN_SUGGEST"} 1');
    expect(text).toContain('average_model_triangle_count 1200');
    expect(text).toContain('viewer_load_time_seconds_sum 1.25');
    expect(text).toContain('viewer_load_time_seconds_count 1');
    expect(text.endsWith('\n')).toBe(true);
  });
});
