/** Rebuild the document from completed captures; makes no application requests. */
import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { screens } from "./catalog";
import { renderReviewDocument } from "./document";

const out=path.resolve("generated-artifacts/onboarding-review");
const manifest=JSON.parse(await readFile(path.join(out,"manifest.json"),"utf8"));
const definitions=new Map(screens.map(screen=>[screen.id,screen]));
manifest.screens=manifest.screens.map((captured:any)=>{
  const definition=definitions.get(captured.id);
  if(!definition)throw Error("Capture no longer in catalog: "+captured.id);
  return{...captured,...definition,heading:definition.title||captured.heading};
});
if(manifest.screens.length!==screens.length)throw Error("Incomplete screen capture inventory");
const html=await renderReviewDocument(manifest.screens);
await writeFile(path.join(out,"onboarding-review.html"),html);
const browser=await chromium.launch({executablePath:"/repl/tools/bin/chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
try{
  const page=await browser.newPage({viewport:{width:1588,height:1123}});
  await page.route("**/*",route=>["data:","blob:","about:"].some(protocol=>route.request().url().startsWith(protocol))?route.continue():route.abort());
  await page.setContent(html,{waitUntil:"networkidle"});
  await page.emulateMedia({media:"print"});
  const validation=await page.evaluate(()=>{
    const pages=[...document.querySelectorAll<HTMLElement>(".pdf-page")];
    const overlaps=pages.flatMap((page,index)=>{
      const footer=page.querySelector("footer")!.getBoundingClientRect();
      return [...page.children].filter(el=>el.tagName!=="FOOTER"&&el.getBoundingClientRect().bottom>footer.top-3).map(el=>({page:index+1,element:el.tagName}));
    });
    const missingLinks=[...document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')].filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.hash);
    const unloadedImages=[...document.images].filter(image=>!image.complete||image.naturalWidth===0).length;
    return{pages:pages.length,overlaps,missingLinks,unloadedImages};
  });
  if(validation.overlaps.length||validation.missingLinks.length||validation.unloadedImages)throw Error("Document validation failed: "+JSON.stringify(validation));
  await page.pdf({path:path.join(out,"onboarding-review.pdf"),format:"A3",landscape:true,printBackground:true,preferCSSPageSize:true,margin:{top:0,right:0,bottom:0,left:0}});
  await writeFile(path.join(out,"manifest.json"),JSON.stringify(manifest,null,2));
  const result={...validation,screens:manifest.screens.length,phoneViews:manifest.screens.reduce((n:number,screen:any)=>n+screen.images.length,0),pdfBytes:(await stat(path.join(out,"onboarding-review.pdf"))).size,liveApiCalls:0};
  await writeFile(path.join(out,"validation.json"),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
