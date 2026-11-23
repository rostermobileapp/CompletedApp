import { test } from "node:test";
import assert from "node:assert/strict";
import { createSignupAgeRestriction } from "./signupAgeRestriction";

test("No keeps navigation restricted across reload until explicit adult continuation or sign-in", () => {
  const saved=new Map<string,string>();
  const storage={getItem:(key:string)=>saved.get(key)??null,setItem:(key:string,value:string)=>{saved.set(key,value);},removeItem:(key:string)=>{saved.delete(key);}};
  const first=createSignupAgeRestriction(storage);
  assert.equal(first.snapshot(),false);
  first.requireParent();
  assert.equal(first.snapshot(),true);
  const reloaded=createSignupAgeRestriction(storage);
  assert.equal(reloaded.snapshot(),true);
  reloaded.allowAdult();
  assert.equal(createSignupAgeRestriction(storage).snapshot(),false);
});
test("storage failure does not release the current under-18 restriction", () => {
  const fail=()=>{throw new Error("Unavailable");};
  const store=createSignupAgeRestriction({getItem:fail,setItem:fail,removeItem:fail});
  store.requireParent();
  assert.equal(store.snapshot(),true);
});
