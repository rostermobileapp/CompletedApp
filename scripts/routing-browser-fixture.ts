/**
 * Isolated browser regression fixture: real App Router, Login, NotFound, Wouter,
 * QueryClient and mobile screen container; fake auth, account API and page bodies.
 * Never imported by the app or production build; no database or provider access.
 * Run: npx tsx scripts/routing-browser-fixture.ts (port 3001).
 */
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

const root = process.cwd();
const stateSource = `
import React, {useSyncExternalStore} from 'react';
import {QueryClient} from '@tanstack/react-query';
let state = window.__routeFixtureInitial || {user: null, isLoading: true};
let listeners = new Set();
export const queryClient = new QueryClient({defaultOptions:{queries:{
  retry:false, queryFn: async ({queryKey}) => {
    if (queryKey[0] === '/api/user') {
      await new Promise(r=>setTimeout(r, window.fixture.accountDelay));
      return {id:state.user?.id, onboardingCompleted:true, role:'free_tier'};
    }
    return [];
  }
}}});
function update(next) {state={...state,...next}; listeners.forEach(fn=>fn());}
window.fixture = {
  accountDelay: 0, loginDelay: 0,
  setAuth: (userId, loading=false)=>update({user:userId ? {id:userId,role:'free_tier'} : null,isLoading:loading}),
  navigate: path=>window.history.pushState(null,'',path),
};
export function useAuth() {
  const s=useSyncExternalStore(fn=>{listeners.add(fn);return ()=>listeners.delete(fn)},()=>state);
  return {...s,isAuthenticated:!!s.user};
}
export function useIsDesktopWeb(){return false}
export function isInsideNativeWrapper(){return window.__fixtureNative !== false}
export function useDemo(){return {isActive:false}}
export const DemoContextProvider=({children})=>children;
export function useToast(){return {toast:()=>{}}}
export const supabase={auth:{
  signInWithPassword: async ()=> {
    await new Promise(r=>setTimeout(r,window.fixture.loginDelay));
    update({user:{id:'fixture-user',role:'free_tier'},isLoading:false});
    return {error:null};
  },
  signUp:async()=>({error:null,data:{session:{},user:{id:'fixture-user',identities:[{}]}}})
}};
`;
const passSource = `
import React from 'react';
const Pass=({children})=>children || null;
export default Pass;
export const PermissionProvider=Pass, DemoContextProvider=Pass, ThemeProvider=Pass,
  TooltipProvider=Pass, SlideUpOverlayProvider=Pass, WebSocketProvider=Pass,
  ErrorBoundary=Pass, PageTransition=Pass, DesktopAppShell=Pass;
export const PricingPage=Pass, AboutPage=Pass, FeaturesPage=Pass, PartnersPage=Pass;
export const Toaster=()=>null, HPIBBanner=()=>null, ActiveDraftsBanner=()=>null,
  SlideOutMenu=()=>null, ScrollToTop=()=>null, NativelyNotificationsInitializer=()=>null,
  NativeCalendarAutoSync=()=>null, BadgeEarnedHost=()=>null, BirthdayHost=()=>null,
  TriviaHost=()=>null, TrophyCasePreview=()=>null, EmailVerificationModal=()=>null;
export const useAppDataPrefetch=()=>{}, applyCanonicalUrl=()=>{};
export function BottomNavigation(){return <nav aria-label="Fixture navigation">
  {[['/teams','My Team'],['/messages','Messages'],['/','Home'],['/payment-requests','Payments'],['/profile','Profile']].map(([path,label])=>
    <button key={path} onClick={()=>window.history.pushState(null,'',path)}>{label}</button>)}
</nav>}
`;

const result = await build({
  stdin: {
    contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {QueryClientProvider} from '@tanstack/react-query';
      import {Router} from './client/src/App';
      import {queryClient} from 'fixture-state';
      createRoot(document.getElementById('root')).render(
        <QueryClientProvider client={queryClient}><Router/></QueryClientProvider>);
    `,
    resolveDir: root, loader: 'tsx',
  },
  bundle: true, write: false, format: 'esm', jsx: 'automatic',
  define: { 'import.meta.env.DEV': 'true' },
  plugins: [{
    name: 'isolated-routing-fixture',
    setup(builder) {
      builder.onResolve({ filter: /^fixture-state$/ }, () => ({ path: 'state', namespace: 'fixture' }));
      builder.onResolve({ filter: /(?:useAuth|useIsDesktopWeb|useToast|lib\/supabase|context\/DemoContext|lib\/queryClient)$/ }, args => {
        if (args.importer.includes('/client/') || args.importer === 'state') return { path: 'state', namespace: 'fixture' };
      });
      builder.onResolve({ filter: /^@\/pages\// }, args => {
        if (args.path.endsWith('/Login') || args.path.endsWith('/not-found')) return;
        return { path: args.path.split('/').pop()!, namespace: 'page' };
      });
      builder.onResolve({ filter: /^@\/|^\.\// }, args => {
        if (args.importer === resolve(root, 'client/src/App.tsx') &&
          !/appRouteEntry|mobileScreenResume|SwipeableMainScreens|pages\/Login|pages\/not-found/.test(args.path)) {
          return { path: 'pass', namespace: 'fixture' };
        }
        if (args.path.endsWith('/EmailVerificationModal')) return { path: 'pass', namespace: 'fixture' };
      });
      builder.onResolve({ filter: /^@assets\/|\.png$/ }, () => ({ path: 'image', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
        contents: args.path === 'state' ? stateSource : args.path === 'image'
          ? `export default 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'` : passSource,
        loader: 'tsx', resolveDir: root,
      }));
      builder.onLoad({ filter: /.*/, namespace: 'page' }, args => ({
        contents: `import React from 'react';export const TrophyCasePreview=()=>null;export default function Page(){return <h1 data-testid="fixture-page">${args.path}</h1>}`,
        loader: 'tsx', resolveDir: root,
      }));
    },
  }],
});
const reports: unknown[] = [];
createServer((req, res) => {
  if (req.url === '/fixture.js') {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.end(result.outputFiles[0].contents);
  } else if (req.url === '/api/client-error') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => { reports.push(JSON.parse(body)); res.end('{}'); });
  } else if (req.url === '/__reports') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(reports));
  } else {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{font:16px system-ui;background:#111;color:white;margin:0}button,input{font:inherit;padding:12px;margin:4px}nav{position:fixed;bottom:0;background:#222;width:100%}[aria-hidden=true]{display:none!important}.fixed{position:fixed}.inset-0{inset:0}.absolute{position:absolute}</style>
    </head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>`);
  }
}).listen(3001, '0.0.0.0', () => console.log('Isolated routing fixture listening on 3001'));
