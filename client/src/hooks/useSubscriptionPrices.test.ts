import assert from "node:assert/strict";
import test from "node:test";
import { formatSubscriptionPrice } from "./useSubscriptionPrices";

test("subscription cards show the configured amounts, not estimated prices",()=>{
  assert.equal(formatSubscriptionPrice({amount:6.49,currency:"usd"}),"$6.49");
  assert.equal(formatSubscriptionPrice({amount:12,currency:"usd"}),"$12");
  assert.equal(formatSubscriptionPrice({amount:7.25,currency:"usd"}),"$7.25");
  assert.equal(formatSubscriptionPrice({amount:0,currency:"usd"}),"$0");
});
test("missing or invalid prices never become a guessed subscription amount",()=>{
  for(const value of [undefined,{amount:null,currency:"usd"},{amount:6.49,currency:null},
    {amount:-1,currency:"usd"},{amount:NaN,currency:"usd"},{amount:Infinity,currency:"usd"},
    {amount:6.49,currency:"invalid"}]){
    assert.equal(formatSubscriptionPrice(value),null);
  }
});
