"""Self-contained, downloadable review document; no app/network access."""
import base64
import csv
import html
from pathlib import Path

folder = Path("generated-artifacts/website-review")
with (folder / "proposed-app-cleanup.csv").open() as handle:
    rows = list(csv.DictReader(handle))

def picture(file, caption):
    encoded = base64.b64encode((folder / file).read_bytes()).decode()
    return f'<figure><img src="data:image/jpeg;base64,{encoded}" alt="{html.escape(caption)}"><figcaption>{html.escape(caption)}</figcaption></figure>'

table = "".join(
    "<tr>" + "".join(f"<td>{html.escape(row[key])}</td>" for key in ["file", "proposal", "condition"]) + "</tr>"
    for row in rows
)
document = """<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RosterHockey — standalone website handoff</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#080f18;color:#e4edf8;font:16px/1.6 system-ui,sans-serif}
main{max-width:1180px;margin:auto;padding:48px 24px}h1{font-size:clamp(32px,5vw,56px);line-height:1.1;max-width:900px}
h2{margin-top:44px}a{color:#83b8ff}p,li{max-width:960px}.muted,figcaption{color:#aebed1}
.status{display:inline-block;background:#10382c;border:1px solid #377b61;border-radius:20px;padding:6px 14px;color:#baf2d5}
.note{border-left:4px solid #edb35c;background:#231f19;padding:16px 20px;margin:24px 0}.checks{display:flex;flex-wrap:wrap;gap:12px}
.checks div{flex:1;min-width:180px;background:#111f30;padding:20px;border-radius:12px}.checks strong{display:block;font-size:30px;color:#83b8ff}
code{overflow-wrap:anywhere;color:#c7ddff}figure{margin:16px 0}img{max-width:100%;border:1px solid #30445d;border-radius:12px}
.phones{display:grid;grid-template-columns:1fr 1fr;gap:24px;max-width:850px}figcaption{font-size:14px}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{text-align:left;padding:12px;vertical-align:top;border-bottom:1px solid #2c3e55;overflow-wrap:anywhere}
td:first-child{width:43%;font-family:monospace}details{background:#101d2b;border-radius:12px;padding:18px;overflow:auto}
summary{cursor:pointer;font-weight:700}@media(max-width:600px){main{padding:30px 16px}.phones{grid-template-columns:1fr}table{min-width:850px}}
</style><main>
<span class="status">Copy-only stage passed — ready to import</span>
<h1>Independent website package, with the app kept intact.</h1>
<p class="muted">RosterHockey WEBSITE → a new Replit project. Existing APP → retained here. No new project has been created automatically.</p>
<div class="checks"><div><strong>20</strong>prerendered public routes</div><div><strong>10</strong>pages checked at phone + desktop widths</div><div><strong>0</strong>APP/API requests or missing assets</div><div><strong>0</strong>APP files deleted</div></div>
<h2>Create the separate project</h2>
<ol><li>In this project's Files panel, download <code>generated-artifacts/RosterHockey-Website.zip</code> (about 20 MB).</li>
<li>Open <a href="https://replit.com/import" target="_blank" rel="noopener noreferrer">Replit Import</a>, select <strong>ZIP</strong>, and upload that archive.</li>
<li>Name the new project <strong>RosterHockey Website</strong>. It will then appear separately in the project sidebar. Use its README to run and verify it.</li></ol>
<p><strong>Import only the website ZIP, not this entire app project. No app secrets are needed.</strong></p>
<div class="note"><strong>Not a live launch:</strong> no publishing, DNS, hosting, auth-provider, native-wrapper or database setup was changed.
The new APP application route and attribution changes must be separately approved and published before the WEBSITE goes live; its production Apply destination may not exist until then.</div>
<h2>What passed</h2>
<ul><li>Fresh npm ci, standalone typecheck and production build outside APP with no APP environment credentials. The standalone website has zero type errors.</li>
<li>Website canonicals/structured data, real 404s, explicit APP redirects and preserved campaign queries; local apex-to-www normalization.</li>
<li>Desktop/phone layouts, local media/fonts, safe new-tab APP links, annual pricing toggle and original bracket SVG animation.</li>
<li>APP public partner form, file restrictions, same-origin multipart fields, error/retry and confirmation. Both submissions intercepted: no live applications or email sends.</li>
<li>Existing APP frontend production build passed. Its pre-existing 227 type errors are unchanged; this is not a claim that the APP typecheck is clean.</li></ul>
<h2>Preserved boundaries</h2>
<p>The WEBSITE has its own source, assets, dependencies/lock, router, dev/build/start commands, static pricing, SEO and legal copies.
There are no APP SDKs, backend proxy, database, credentials or parent-project imports. Vercel Web Analytics is intentionally off until approved hosting enables it.
Applications, uploads, email verification, partner portal/admin, auth, onboarding, billing and HPIB tracking stay with APP.
Soccer/baseball retain their existing hockey redirects, not new sport pages.</p>
<h2>Verified screens</h2>
"""
document += picture("home-1440.jpg", "Isolated WEBSITE — desktop homepage")
document += '<div class="phones">'
document += picture("home-402.jpg", "Isolated WEBSITE — phone homepage")
document += picture("app-partner-application.jpg", "APP-owned public application — preview, not a published route")
document += "</div>"
document += f"""<h2>Proposed APP cleanup — not applied</h2>
<p>{len(rows)} review entries follow. Conditional candidates are not approved deletions. First import and verify the independent project, extract the APP form's minimal dependencies, review retained references, and obtain explicit approval.
All uploaded/historical/dynamically referenced media, shared APP components, legal copies, native association files, backend/data/billing and HPIB stay protected.</p>
<details><summary>Open the proposed cleanup and keep list</summary><table><thead><tr><th>Current APP file</th><th>Proposal</th><th>Condition</th></tr></thead><tbody>{table}</tbody></table></details>
<h2>Remaining release checks</h2>
<p>Verify the actual imported Replit project; publish approved APP prerequisites before website launch; test real email and phone/native entry/install behavior; approve hosting/domain cutover and any APP cleanup separately.
An ordinary app-store install is not guaranteed to retain referral query parameters. Manual partner selection remains the fallback.</p>
</main></html>"""
(folder / "RosterHockey-Website-Handoff.html").write_text(document)
print("Created self-contained website handoff report with screenshots and proposed cleanup.")
