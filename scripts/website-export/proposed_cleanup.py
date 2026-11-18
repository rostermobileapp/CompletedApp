"""Generate a review list only. Never deletes, moves or edits APP files."""
import csv
from pathlib import Path

root = Path.cwd()
out = root / "generated-artifacts/website-review"
out.mkdir(parents=True, exist_ok=True)
keep = {
    "client/src/pages/HPIBDownload.tsx": "APP owns HPIB tracking; preserve campaign page and handlers",
    "client/src/components/marketing/PartnersPage.tsx": "APP application currently reuses this component; extract form before any cleanup",
    "client/src/components/marketing/PartnersPage.css": "APP application retains the existing form styling",
    "client/src/components/marketing/RosterPageNav.tsx": "Still statically imported by the APP application component",
    "client/src/components/marketing/RosterPageNav.css": "Preserve until the APP application styling has been independently extracted",
}
rows = []
with open(root / "generated-artifacts/domain-split-audit/files.csv") as handle:
    for item in csv.DictReader(handle):
        file = item["file"]
        if item["ownership"] != "WEBSITE" or not (root / file).is_file():
            continue
        if file.startswith(("attached_assets/", ".canvas/", "artifacts/")):
            continue
        if file in keep:
            rows.append({"file": file, "proposal": "KEEP IN APP", "condition": keep[file]})
        elif file.startswith(("client/src/", "scripts/", "client/public/marketing/")):
            rows.append({"file": file, "proposal": "CONDITIONAL CLEANUP CANDIDATE", "condition": "Only after new WEBSITE import is verified, APP routing/build is separated, retained APP references are checked, and owner approves"})
for file, reason in keep.items():
    if not any(row["file"] == file for row in rows):
        rows.append({"file": file, "proposal": "KEEP IN APP", "condition": reason})
with open(out / "proposed-app-cleanup.csv", "w") as handle:
    writer = csv.DictWriter(handle, fieldnames=["file", "proposal", "condition"])
    writer.writeheader()
    writer.writerows(sorted(rows, key=lambda row: (row["proposal"], row["file"])))
notes = [
    "# Proposed APP cleanup — NOT APPLIED",
    "",
    "No source files have been deleted. This is a review list, not a deletion script.",
    "The website must first be imported into a separate Replit project and verified there.",
    "",
    "## Must retain",
    *[f"- `{file}` — {reason}." for file, reason in keep.items()],
    "- APP legal copies, auth/onboarding, partner verification/portal/admin, all backend endpoints, billing, workers, data, native association files and shared APP components.",
    "- All uploaded/historical/dynamically referenced media. They are not deletion candidates merely because the website copied them.",
    "",
    "## Conditional candidates",
    *[f"- `{row['file']}`" for row in sorted(rows, key=lambda row: row["file"]) if row["proposal"] == "CONDITIONAL CLEANUP CANDIDATE"],
    "",
    "## Prerequisites before approval can be acted on",
    "- Extract the minimal APP application/form styles so its public route no longer imports a full marketing page.",
    "- Switch APP root/auth, exact marketing redirects, crawl policy and build/prerender ownership as already planned.",
    "- Re-run the retained APP import/asset scan. Prefix helpers and loops hid assets from the earlier literal-only inventory.",
    "- Review any additional media separately against both code and dynamic database/storage references; do not delete arbitrary uploads.",
    "- Obtain explicit deletion and separate publishing/domain-cutover approval.",
]
(out / "proposed-app-cleanup.md").write_text("\n".join(notes) + "\n")
print(f"Prepared {len(rows)} review entries; no files deleted.")
