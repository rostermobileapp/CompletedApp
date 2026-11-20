import { useState } from "react";

/** Screen demonstration only. No values leave this component, even on submit. */
export function ParentAssistedSetupPreview({onContinue,busy=false}:{onContinue:()=>Promise<void>;busy?:boolean}){
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [code,setCode]=useState("");
  const [guardian,setGuardian]=useState(false);
  const ready=!!name.trim()&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&/^\d{4}$/.test(code)&&guardian;
  return <form autoComplete="off" className="space-y-4 rounded-xl border p-4" onSubmit={e=>{
    e.preventDefault();if(!ready||busy)return;
    // Clear even the simulated code before continuing. Never pass identity or
    // code values to the mock transport, Auth, analytics or browser storage.
    setCode("");setName("");setEmail("");setGuardian(false);void onContinue();
  }}>
    <h2 className="font-semibold">Parent-assisted setup</h2>
    <p className="text-sm">Please hand the device to your parent or guardian. They can enter their information and the setup code here instead of using the shared link.</p>
    <p role="note" className="text-sm text-amber-700 dark:text-amber-300">Preview only: use fictional information and any four digits. No email is sent and no code is verified. Real parent access requires sign-in and a code sent to the parent's registered email.</p>
    <label className="block text-sm">Parent or guardian name<input className="block w-full rounded-lg border bg-background p-3" required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
    <label className="block text-sm">Parent email<input className="block w-full rounded-lg border bg-background p-3" type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label className="block text-sm">Setup code (four digits)<input className="block w-full rounded-lg border bg-background p-3" type="password" inputMode="numeric" autoComplete="off" required minLength={4} maxLength={4} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,4))}/></label>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={guardian} onChange={e=>setGuardian(e.target.checked)}/>I am the parent or guardian, and I am 18 or older.</label>
    <button type="submit" disabled={!ready||busy} className="rounded-lg border px-4 py-3 disabled:opacity-50">Continue parent preview</button>
  </form>;
}
