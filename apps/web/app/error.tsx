'use client';

import {useEffect} from 'react';

export default function ErrorPage({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
  useEffect(()=>{console.error('[web-error]',{message:error.message,digest:error.digest});},[error]);
  return <main style={{padding:32,maxWidth:720,margin:'0 auto'}}>
    <h1>Something went wrong</h1>
    <p>The editor could not complete that operation. Your saved project data has not been changed by this error.</p>
    <button onClick={reset}>Try again</button>
  </main>;
}
