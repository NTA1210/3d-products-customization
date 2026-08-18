import {ComponentVariantSchema,type ComponentVariant} from '@product3d/model-schema';
import {PresetRuleSetSchema,type PresetRule} from '@product3d/preset-engine';
import {authFetch} from './supabase-browser';

const root=()=>`${(process.env.NEXT_PUBLIC_API_URL??'http://localhost:4000').replace(/\/$/,'')}/api`;
async function json<T>(response:Response):Promise<T>{if(!response.ok)throw new Error(await response.text());return response.json() as Promise<T>}

export type RuntimeVariant=ComponentVariant&{signedUrl:string;metadata:Record<string,unknown>};
export type StyleRecord={id:string;name:string;description?:string|null;styleTags:string[];rulesJson:PresetRule[]};
export type UserPresetRecord={id:string;name:string;rulesJson:PresetRule[];createdAt?:string;updatedAt?:string};

export async function getVariants(groupId?:string,role?:string){const q=new URLSearchParams();if(groupId)q.set('groupId',groupId);if(role)q.set('role',role);const rows=await json<Array<Record<string,unknown>>>(await fetch(`${root()}/variants?${q}`));return rows.map(row=>({...ComponentVariantSchema.parse(row),signedUrl:String(row.signedUrl),metadata:(row.metadata??{}) as Record<string,unknown>}));}
export async function getStyles(){const rows=await json<Array<Omit<StyleRecord,'rulesJson'>&{rulesJson:unknown}>>(await fetch(`${root()}/styles`));return rows.map(row=>({...row,rulesJson:PresetRuleSetSchema.parse(row.rulesJson)}));}
export async function getPresets(){const rows=await json<Array<Omit<UserPresetRecord,'rulesJson'>&{rulesJson:unknown}>>(await authFetch(`${root()}/presets`));return rows.map(row=>({...row,rulesJson:PresetRuleSetSchema.parse(row.rulesJson)}));}
export async function savePreset(name:string,rulesJson:PresetRule[]){return json<UserPresetRecord>(await authFetch(`${root()}/presets`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,rulesJson:PresetRuleSetSchema.parse(rulesJson)})}));}
export async function deletePreset(id:string){await json<{deleted:boolean}>(await authFetch(`${root()}/presets/${encodeURIComponent(id)}`,{method:'DELETE'}));}
