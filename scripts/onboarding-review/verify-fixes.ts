import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import type { ReviewSpec } from "./catalog";
import { formatSubscriptionPrice, type SubscriptionPrices } from "../../client/src/hooks/useSubscriptionPrices";

/** Checks actual rendered components; never performs account or purchase actions. */
export async function verifyOnboardingFixes(page:Page,spec:ReviewSpec,prices:SubscriptionPrices) {
  const checks:string[]=[];
  if(!["E02","S03","U02","U06","L01","Q02","Q19","Q20","F04","F01","H03"].includes(spec.id))return checks;
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});
    for(const dark of [false,true]){
      await page.evaluate(value=>document.documentElement.classList.toggle("dark",value),dark);
      const key=`${spec.id}/${width}/${dark?"dark":"light"}`;
      if(["E02","S03","U02","U06","L01"].includes(spec.id)){
        const fields=await page.locator("input:not([type=hidden]):not([data-input-otp])").evaluateAll(inputs=>inputs.map(input=>{
          const style=getComputedStyle(input);
          return{background:style.backgroundColor,hasPlaceholder:input.hasAttribute("placeholder"),placeholder:getComputedStyle(input,"::placeholder").color};
        }));
        assert.ok(fields.length>0,key+": missing inputs");
        for(const field of fields){
          assert.equal(field.background,"rgb(255, 255, 255)",key+": input must be white");
          if(field.hasPlaceholder)assert.equal(field.placeholder,"rgb(148, 163, 184)",key+": placeholder must be grey");
        }
        if(spec.id==="S03"){
          assert.equal(await page.getByLabel("City",{exact:true}).count(),1);
          assert.equal(await page.getByLabel("Town",{exact:true}).count(),0);
        }
        checks.push(key+": white inputs and grey placeholders");
      }
      if(spec.id==="Q02"){
        const reviews=await page.getByTestId("onboarding-review-card").evaluateAll(cards=>cards.map(card=>{
          const name=card.querySelector("[data-review-name]")!.getBoundingClientRect();
          const stars=card.querySelector("[data-review-stars]")!.getBoundingClientRect();
          return{stars:card.querySelectorAll("[data-review-stars] svg").length,right:stars.left>=name.right,aligned:Math.abs((stars.top+stars.bottom-name.top-name.bottom)/2)<3,height:card.getBoundingClientRect().height};
        }));
        assert.equal(reviews.length,3);
        assert.ok(reviews.every(review=>review.stars===5&&review.right&&review.aligned&&review.height<240),key+": reviews must be compact with five stars right of names");
        checks.push(key+": compact reviews and inline five-star ratings");
      }
      if(["Q19","Q20","F04"].includes(spec.id)){
        const body=await page.locator("body").innerText();
        const pro=formatSubscriptionPrice(prices.player_pro_monthly);
        assert.ok(pro,"A verified Player Pro price is required for this check");
        assert.ok(body.includes(pro),key+": incorrect Player Pro price");
        if(spec.id!=="F04"){
          const commissioner=formatSubscriptionPrice(prices.commissioner_monthly);
          assert.ok(commissioner&&body.includes(commissioner),key+": incorrect Commissioner price");
          assert.ok(!body.includes("~$"),key+": estimated price must not appear");
        }else{
          assert.ok(body.includes("Up to 2 players")&&!body.includes("4 players"),key+": family plan must cover two players");
        }
        checks.push(key+": configured subscription prices");
      }
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
      assert.equal(overflow,false,key+": horizontal overflow");
    }
  }
  const originalUrl=page.url();
  if(spec.id==="F01"){
    for(const count of [1,2,3]){
      const url=new URL(originalUrl);url.searchParams.set("familySize",String(count));
      await page.goto(url.toString(),{waitUntil:"networkidle"});
      assert.equal(await page.getByRole("button",{name:"Add a player",exact:true}).isDisabled(),count>=2);
      assert.equal(await page.getByRole("button",{name:"Add another player",exact:true}).isDisabled(),count>=2);
      assert.equal(await page.getByRole("button",{name:"Remove a player",exact:true}).isDisabled(),count<=1);
      assert.equal(await page.getByRole("button",{name:"Continue",exact:true}).isDisabled(),count>2);
      if(count>2)assert.equal(await page.getByRole("alert").count(),1);
      checks.push(`F01: ${count}-player draft has correct add/remove and continue controls`);
    }
    await page.goto(originalUrl,{waitUntil:"networkidle"});
  }
  if(["Q19","Q20","F04"].includes(spec.id)){
    const url=new URL(originalUrl);url.searchParams.set("pricesUnavailable","1");
    await page.goto(url.toString(),{waitUntil:"networkidle"});
    await page.getByText("Price unavailable",{exact:true}).first().waitFor();
    assert.ok(!(await page.locator("body").innerText()).includes("~$"));
    checks.push(spec.id+": missing prices are explicit, never estimated");
    await page.goto(originalUrl,{waitUntil:"networkidle"});
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>document.documentElement.classList.add("dark"));
  return checks;
}
