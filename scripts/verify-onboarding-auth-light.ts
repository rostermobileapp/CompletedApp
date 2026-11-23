/**
 * Styling regression checks for E03–E05 and V01–V09.
 * The capture harness uses real components with read-only synthetic boundaries.
 * No provider, email, password or database operations are performed.
 */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import ts from "typescript";

const files=[
  "client/src/components/AuthModal.tsx",
  "client/src/components/EmailVerificationModal.tsx",
  "client/src/pages/ParentVerification.tsx",
];
function withoutStyling(source:string){
  const ast=ts.createSourceFile("component.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const transformed=ts.transform(ast,[context=>{
    const visit=(node:ts.Node):ts.VisitResult<ts.Node>=>{
      if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)&&node.moduleSpecifier.text.endsWith(".css"))return undefined;
      if(ts.isJsxAttribute(node)&&["className","overlayClassName"].includes(node.name.getText(ast)))return undefined;
      return ts.visitEachChild(node,visit,context);
    };
    return root=>ts.visitNode(root,visit) as ts.SourceFile;
  }]);
  const result=ts.createPrinter({removeComments:true}).printFile(transformed.transformed[0] as ts.SourceFile);
  transformed.dispose();return result;
}
const baselinePath=process.argv.find(argument=>argument.startsWith("--baseline="))?.slice("--baseline=".length);
let unchangedLogicVerified=false;
if(baselinePath){
  const before=JSON.parse(await readFile(baselinePath,"utf8"));
  for(const file of files){
    assert.ok(before[file],"Missing baseline for "+file);
    assert.equal(withoutStyling(await readFile(file,"utf8")),withoutStyling(before[file]),"Non-styling behavior changed in "+file);
  }
  unchangedLogicVerified=true;
}
const ids=["E03","E04","E05",...Array.from({length:9},(_,index)=>`V0${index+1}`)];
const out="generated-artifacts/onboarding-auth-light";
await mkdir(out,{recursive:true});
execFileSync("npx",["tsx","scripts/export-onboarding-review.ts",`--out-dir=${out}`,`--only=${ids.join(",")}`,"--capture-only","--verify-light"],{stdio:"inherit",timeout:150000});
const manifest=JSON.parse(await readFile(`${out}/manifest.json`,"utf8"));
assert.equal(manifest.screens.length,12);
assert.equal(manifest.lightChecks.length,72);
assert.equal(manifest.forbiddenApiAttempts,0);
assert.deepEqual(manifest.screens.map((screen:any)=>screen.id).sort(),[...ids].sort());
assert.ok(manifest.screens.every((screen:any)=>!screen.error&&screen.pageErrors.length===0&&screen.images.length>0));
for(const id of ids){
  assert.equal(manifest.lightChecks.filter((check:any)=>check.id===id).length,6);
}
const result={
  outcome:"passed",screens:ids,themeAndViewportChecks:72,
  unchangedLogicVerified,realEmailsSent:0,realPasswordsChanged:0,realAccountsCreated:0,
};
await writeFile(`${out}/result.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
