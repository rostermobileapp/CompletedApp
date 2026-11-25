import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import type { Plugin } from "esbuild";

/** Render the real Router, mobile screen container and Dashboard. Only external
 * providers and secondary feature dialogs/pages are synthetic in this fixture.
 * In particular, never replace Home with a test heading or stand-in page. */
export function parentHomeFixture(root: string): Plugin {
  const sources = ["App.tsx", "pages/Dashboard.tsx"].map(file => resolve(root, "client/src", file));
  const exportsByPath = new Map<string, Set<string>>();
  for (const file of sources) {
    const tree = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const node of tree.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const names = exportsByPath.get(node.moduleSpecifier.text) ?? new Set<string>();
      const named = node.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const item of named.elements) names.add(item.propertyName?.text ?? item.name.text);
      }
      exportsByPath.set(node.moduleSpecifier.text, names);
    }
  }
  return {
    name: "real-parent-home-with-synthetic-peripheral-providers",
    setup(builder) {
      builder.onResolve({ filter: /^@\/|^\.\// }, args => {
        if (!sources.includes(args.importer)) return;
        if (/pages\/(?:Dashboard|ParentVerification)$|components\/SwipeableMainScreens$|lib\/(?:appRouteEntry|mobileScreenResume|parentVerificationSession|signupAgeRestriction|queryClient|supabase)$|hooks\/useAuth$/.test(args.path)) return;
        if (args.importer.endsWith("/Dashboard.tsx") && /components\/ui\//.test(args.path)) return;
        return { path: args.path, namespace: "home-peripheral" };
      });
      // The real swipe container imports all primary pages. Keep Dashboard real;
      // the inactive other tabs need no provider graph for this Home regression.
      builder.onResolve({ filter: /^@\/pages\// }, args => {
        if (!args.importer.endsWith("/SwipeableMainScreens.tsx") || args.path.endsWith("/Dashboard")) return;
        return { path: args.path, namespace: "home-peripheral" };
      });
      builder.onLoad({ filter: /.*/, namespace: "home-peripheral" }, args => {
        const names = exportsByPath.get(args.path) ?? new Set<string>();
        const values: Record<string, string> = {
          useIsDesktopWeb: "()=>false",
          isInsideNativeWrapper: "()=>false",
          useDemo: "()=>({isActive:false})",
          usePermissions: "()=>({user:{id:JSON.parse(atob(window.fixtureAccessToken.split('.')[1])).sub,role:'free_tier'},canAccessPremiumFeatures:()=>false,hasStatManagerAccess:()=>false})",
          useToast: "()=>({toast:()=>{}})",
          useTheme: "()=>({theme:'light'})",
          useSlideUpOverlay: "()=>({openOverlay:()=>{}})",
          useLeagueUnreadMessages: "()=>({})",
          useTeamSkinFacts: "()=>null",
          skinTeamLabel: "(_facts,_id,name)=>name",
          notifyDashboardSelectionChange: "()=>{}",
          DASHBOARD_SELECTION_CHANGE_EVENT: "'dashboardSelectionChange'",
          setPageTransitionDirection: "()=>{}",
          syncSavedNativeCalendarEvents: "async()=>{}",
          applyCanonicalUrl: "()=>{}",
          useAppDataPrefetch: "()=>{}",
        };
        return { resolveDir: root, loader: "tsx", contents: `
          import React from 'react';
          const Pass=({children})=>children??null;export default Pass;
          ${[...names].map(name => `export const ${name}=${values[name] ?? "Pass"};`).join("\n")}
        ` };
      });
      builder.onResolve({ filter: /^@assets\// }, () => ({ path: "image", namespace: "home-image" }));
      builder.onLoad({ filter: /.*/, namespace: "home-image" }, () => ({
        loader: "js", contents: `export default 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'`,
      }));
    },
  };
}
