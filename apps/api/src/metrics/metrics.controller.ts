import {BadRequestException,Body,Controller,Get,Header,Injectable,Post,Req,UseGuards} from '@nestjs/common';
import {z} from 'zod';
import {AuthRequest,requireAuthUser,SupabaseAuthGuard} from '../auth/auth.service';
import {PrismaService} from '../prisma/prisma.service';

const ClientMetricSchema=z.object({name:z.literal('viewer_load_time'),valueMs:z.number().finite().positive().max(10*60*1000)});
const SAMPLE_LIMIT=Math.max(100,Math.min(50_000,Number(process.env.METRICS_SAMPLE_LIMIT??10_000)));

function esc(value:string){return value.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n')}
function labels(values:Record<string,string>){const pairs=Object.entries(values);return pairs.length?`{${pairs.map(([key,value])=>`${key}="${esc(value)}"`).join(',')}}`:''}
function countBy<T>(items:T[],key:(item:T)=>string){const result=new Map<string,number>();for(const item of items){const value=key(item);result.set(value,(result.get(value)??0)+1)}return result}
function durationSeconds(createdAt:Date,updatedAt:Date){return Math.max(0,(updatedAt.getTime()-createdAt.getTime())/1000)}

@Injectable()
export class MetricsService{
 private viewerLoadCount=0;
 private viewerLoadSumSeconds=0;
 recordViewerLoad(valueMs:number){this.viewerLoadCount+=1;this.viewerLoadSumSeconds+=valueMs/1000}
 async render(db:PrismaService){
  const [assets,jobs,aiRequests,checks,renders]=await Promise.all([
   db.modelAsset.findMany({orderBy:{createdAt:'desc'},take:SAMPLE_LIMIT,select:{status:true,createdAt:true,updatedAt:true,analysisJson:true}}),
   db.job.findMany({orderBy:{createdAt:'desc'},take:SAMPLE_LIMIT,select:{type:true,status:true,createdAt:true,updatedAt:true}}),
   db.aIRequest.findMany({orderBy:{createdAt:'desc'},take:SAMPLE_LIMIT,select:{type:true,status:true}}),
   db.manufacturingCheck.findMany({orderBy:{createdAt:'desc'},take:SAMPLE_LIMIT,select:{status:true}}),
   db.renderJob.findMany({orderBy:{createdAt:'desc'},take:SAMPLE_LIMIT,select:{mode:true,quality:true}}),
  ]);
  const lines:string[]=[
   '# HELP product3d_metrics_sample_limit Maximum recent database rows sampled per metric family.',
   '# TYPE product3d_metrics_sample_limit gauge',
   `product3d_metrics_sample_limit ${SAMPLE_LIMIT}`,
  ];
  const assetStatus=countBy(assets,item=>item.status);
  lines.push('# HELP product3d_asset_total Recent imported assets by status.','# TYPE product3d_asset_total gauge');
  for(const [status,count] of assetStatus)lines.push(`product3d_asset_total${labels({status})} ${count}`);
  const completedAssets=assets.filter(item=>['READY','FAILED'].includes(item.status));
  const assetDuration=completedAssets.reduce((sum,item)=>sum+durationSeconds(item.createdAt,item.updatedAt),0);
  lines.push('# HELP asset_import_duration_seconds End-to-end asset import/pipeline duration derived from persisted asset timestamps.','# TYPE asset_import_duration_seconds summary',`asset_import_duration_seconds_sum ${assetDuration}`,`asset_import_duration_seconds_count ${completedAssets.length}`);

  const jobGroups=new Map<string,{count:number,sum:number}>();
  for(const job of jobs){const key=`${job.type}\u0000${job.status}`,current=jobGroups.get(key)??{count:0,sum:0};current.count+=1;current.sum+=durationSeconds(job.createdAt,job.updatedAt);jobGroups.set(key,current)}
  lines.push('# HELP product3d_job_total Recent background jobs by type and status.','# TYPE product3d_job_total gauge','# HELP product3d_job_duration_seconds Persisted job lifetime by type/status.','# TYPE product3d_job_duration_seconds summary');
  for(const [key,value] of jobGroups){const[type,status]=key.split('\u0000'),label=labels({type,status});lines.push(`product3d_job_total${label} ${value.count}`,`product3d_job_duration_seconds_sum${label} ${value.sum}`,`product3d_job_duration_seconds_count${label} ${value.count}`)}
  const analysisJobs=jobs.filter(item=>item.type==='ASSET_ANALYZE_NORMALIZE');
  lines.push('# HELP asset_analysis_duration_seconds Asset analyze/normalize job lifetime.','# TYPE asset_analysis_duration_seconds summary',`asset_analysis_duration_seconds_sum ${analysisJobs.reduce((sum,item)=>sum+durationSeconds(item.createdAt,item.updatedAt),0)}`,`asset_analysis_duration_seconds_count ${analysisJobs.length}`);
  for(const [metric,needle] of [['render_duration_seconds','RENDER'],['export_duration_seconds','EXPORT']] as const){const matching=jobs.filter(item=>item.type.includes(needle));lines.push(`# HELP ${metric} ${needle.toLowerCase()} job lifetime.`,`# TYPE ${metric} summary`,`${metric}_sum ${matching.reduce((sum,item)=>sum+durationSeconds(item.createdAt,item.updatedAt),0)}`,`${metric}_count ${matching.length}`)}

  const aiGroups=countBy(aiRequests,item=>`${item.type}\u0000${item.status}`);
  lines.push('# HELP ai_request_count Recent AI requests by type/status.','# TYPE ai_request_count gauge');
  for(const [key,count] of aiGroups){const[type,status]=key.split('\u0000');lines.push(`ai_request_count${labels({type,status})} ${count}`)}
  const aiFailures=countBy(aiRequests.filter(item=>item.status==='FAILED'),item=>item.type);
  lines.push('# HELP ai_request_failure Recent failed AI requests by type.','# TYPE ai_request_failure gauge');for(const[type,count]of aiFailures)lines.push(`ai_request_failure${labels({type})} ${count}`);

  const checkStatus=countBy(checks,item=>item.status);lines.push('# HELP product3d_manufacturability_check_total Recent manufacturability checks.','# TYPE product3d_manufacturability_check_total gauge');for(const[status,count]of checkStatus)lines.push(`product3d_manufacturability_check_total${labels({status})} ${count}`);
  const renderGroups=countBy(renders,item=>`${item.mode}\u0000${item.quality}`);lines.push('# HELP product3d_render_request_total Recent render requests by mode/quality.','# TYPE product3d_render_request_total gauge');for(const[key,count]of renderGroups){const[mode,quality]=key.split('\u0000');lines.push(`product3d_render_request_total${labels({mode,quality})} ${count}`)}

  const triangleCounts:number[]=[];for(const asset of assets){const raw=asset.analysisJson as any;const value=raw?.stats?.triangles;if(typeof value==='number'&&Number.isFinite(value))triangleCounts.push(value)}
  lines.push('# HELP average_model_triangle_count Average analyzed triangle count in the recent asset sample.','# TYPE average_model_triangle_count gauge',`average_model_triangle_count ${triangleCounts.length?triangleCounts.reduce((a,b)=>a+b,0)/triangleCounts.length:0}`);
  lines.push('# HELP viewer_load_time_seconds Browser GLB viewer load time reported by authenticated clients.','# TYPE viewer_load_time_seconds summary',`viewer_load_time_seconds_sum ${this.viewerLoadSumSeconds}`,`viewer_load_time_seconds_count ${this.viewerLoadCount}`);
  return `${lines.join('\n')}\n`;
 }
}

@Controller('metrics')
export class MetricsController{
 constructor(private readonly db:PrismaService,private readonly metrics:MetricsService){}
 @Get() @Header('Content-Type','text/plain; version=0.0.4; charset=utf-8') get(){return this.metrics.render(this.db)}
 @Post('client') @UseGuards(SupabaseAuthGuard) record(@Req()request:AuthRequest,@Body()body:unknown){requireAuthUser(request);const parsed=ClientMetricSchema.safeParse(body);if(!parsed.success)throw new BadRequestException(parsed.error.flatten());this.metrics.recordViewerLoad(parsed.data.valueMs);return{accepted:true}}
}
