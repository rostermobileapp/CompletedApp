import { useState, type AnchorHTMLAttributes } from "react";

export function _Link({ href, onClick, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const [notice, setNotice] = useState(false);
  return <>
    <a href={href} {...rest} onClick={(event) => {
      onClick?.(event);
      if (!href?.startsWith("#") && !href?.startsWith("/#")) {
        event.preventDefault();
        setNotice(true);
      }
    }}>{children}</a>
    {notice && <button type="button" onClick={() => setNotice(false)} role="status"
      className="fixed bottom-4 left-4 right-4 z-[100] rounded-xl bg-slate-900 p-4 text-white">
      Preview only: {href}. Click to dismiss.
    </button>}
  </>;
}

// Keep the original map section's geometry, but never fetch visitor data or
// load a map provider inside the isolated design comparison.
export function _VisitorMap() {
  return <section className="py-16 px-6 bg-white border-b border-gray-100">
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1 flex items-center justify-center gap-2 flex-wrap">
          <img src="/__mockup/images/roster-home/logo-light.png" alt="Roster" className="h-7 md:h-9 inline-block" />
          <span>is growing across</span><span className="text-[#3c82f4]">North America</span>
        </h2>
      </div>
      <div className="rounded-2xl overflow-hidden border border-blue-100 shadow-sm flex items-center justify-center text-gray-500 text-center px-8"
        style={{ height: 595, background: "#f0f4ff" }}>
        Live visitor map omitted from this isolated preview. No account or visitor data is loaded.
      </div>
      <p className="text-center text-xs text-gray-400 mt-2">Locations are approximate. No personal data is stored.</p>
    </div>
  </section>;
}
