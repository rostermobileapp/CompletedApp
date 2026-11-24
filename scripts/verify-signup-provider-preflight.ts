/** Exercise the real public-settings check without contacting any provider. */
import assert from "node:assert/strict";
import { build } from "esbuild";

const compiled=await build({
  entryPoints:["client/src/lib/supabase.ts"],bundle:true,write:false,
  platform:"browser",format:"cjs",
  define:{
    "import.meta.env.VITE_SUPABASE_URL":'"https://synthetic.example.invalid"',
    "import.meta.env.VITE_SUPABASE_ANON_KEY":'"synthetic-public-key"',
  },
  plugins:[{name:"no-provider",setup(b){
    b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:"sdk",namespace:"fixture"}));
    b.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:"export function createClient(){return {}}",loader:"js"}));
  }}],
});
let settings:unknown={mailer_autoconfirm:false};
let ok=true;
let unreachable=false;
const requests:{url:string;options:RequestInit}[]=[];
const mod={exports:{} as {requireSignupEmailConfirmation:()=>Promise<void>}};
const fetchFixture=async(url:string,options:RequestInit)=>{
  requests.push({url,options});
  if(unreachable)throw new TypeError("Synthetic offline provider");
  return{ok,json:async()=>settings};
};
new Function("module","exports","fetch",compiled.outputFiles[0].text)(mod,mod.exports,fetchFixture);
await mod.exports.requireSignupEmailConfirmation();
assert.equal(requests[0].url,"https://synthetic.example.invalid/auth/v1/settings");
assert.deepEqual(requests[0].options.headers,{apikey:"synthetic-public-key"});
assert.ok(requests[0].options.signal instanceof AbortSignal);
for(const value of [true,undefined,null,"false"]){
  settings={mailer_autoconfirm:value};
  await assert.rejects(mod.exports.requireSignupEmailConfirmation,/No account was created/);
}
ok=false;
await assert.rejects(mod.exports.requireSignupEmailConfirmation,/No account was created/);
ok=true;unreachable=true;
await assert.rejects(mod.exports.requireSignupEmailConfirmation,/Synthetic offline provider/);
console.log("Passed 7 provider-setting cases; no provider requests or registrations.");
