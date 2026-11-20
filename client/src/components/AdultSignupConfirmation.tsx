import { useState } from "react";
export function AdultSignupConfirmation({value,onChange,onParentSetup}:{value:boolean|null;onChange:(value:boolean)=>void;onParentSetup?:()=>void}){
  const [share,setShare]=useState(false);
  return <fieldset className="space-y-3 rounded-xl border p-4">
    <legend className="px-1 text-sm font-semibold">I am 18 or older</legend>
    <div className="flex gap-3">
      <button type="button" className={`rounded-lg border px-4 py-2 ${value===true?"border-blue-600 bg-blue-50":""}`} aria-pressed={value===true} onClick={()=>onChange(true)}>Yes, I am 18+</button>
      <button type="button" className={`rounded-lg border px-4 py-2 ${value===false?"border-blue-600 bg-blue-50":""}`} aria-pressed={value===false} onClick={()=>onChange(false)}>No, I am under 18</button>
    </div>
    {value===false&&<div role="status" className="space-y-2 text-sm">
      <p>Ask a parent to set up your account</p>
      {onParentSetup?<button type="button" className="block rounded-lg border px-4 py-2" onClick={onParentSetup}>My parent is here — enter parent info and setup code</button>:
        <a className="block underline" href="/login?signup=1">Have a parent continue setup here</a>}
      <button type="button" className="underline" onClick={()=>setShare(true)}>Get a parent setup link</button>
      {share&&<label className="block">Share this link with your parent
        <input aria-label="Parent setup link" className="w-full rounded border p-2" readOnly value={`${window.location.origin}/login?signup=1`} onFocus={e=>e.currentTarget.select()}/>
      </label>}
      <p>No account has been created.</p>
    </div>}
  </fieldset>;
}
