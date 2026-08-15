import {createClient,type SupabaseClient} from '@supabase/supabase-js';
let client:SupabaseClient|undefined;
export function browserSupabase(){if(client)return client;const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;if(!url||!key)throw new Error('Supabase browser environment is not configured.');client=createClient(url,key);return client;}
export async function authFetch(input:RequestInfo|URL,init:RequestInit={}){const{data:{session}}=await browserSupabase().auth.getSession();if(!session?.access_token)throw new Error('Sign in before using project and asset APIs.');const headers=new Headers(init.headers);headers.set('authorization',`Bearer ${session.access_token}`);return fetch(input,{...init,headers});}
