import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

/** Local copies of the existing Google Fonts; no font service needed at runtime. */
export function localFonts(write: (file: string, data: string | Uint8Array, source?: string) => Promise<void>) {
  const loaded = new Set<string>();
  async function download(url: string) {
    const key = createHash("sha256").update(url).digest("hex");
    const file = path.resolve("generated-artifacts/website-font-cache", key);
    try { return await fs.readFile(file); } catch { /* first export downloads the public asset */ }
    const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { "User-Agent": "Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36" } });
    if (!response.ok) throw new Error(`Could not localize public font resource (${response.status})`);
    const data = Buffer.from(await response.arrayBuffer());
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
    return data;
  }
  return async (source: string) => {
    const imports = Array.from(source.matchAll(/@import\s+url\(["'](https:\/\/fonts\.googleapis\.com\/[^"']+)["']\);?/g));
    for (const match of imports) {
      let css = "";
      if (!loaded.has(match[1])) {
        loaded.add(match[1]);
        css = (await download(match[1])).toString();
        for (const font of Array.from(css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g))) {
          const url = font[1];
          const name = `${createHash("sha256").update(url).digest("hex").slice(0, 20)}${path.extname(new URL(url).pathname)}`;
          await write(`public/fonts/${name}`, await download(url), url);
          css = css.replaceAll(url, `/fonts/${name}`);
        }
        // Both existing marketing font families are distributed under the OFL.
        for (const family of ["dmsans", "barlowcondensed"]) {
          const url = `https://raw.githubusercontent.com/google/fonts/main/ofl/${family}/OFL.txt`;
          const license = await download(url);
          if (!license.toString().includes("SIL OPEN FONT LICENSE")) throw new Error("Font license could not be verified");
          await write(`public/fonts/licenses/${family}-OFL.txt`, license, url);
        }
      }
      source = source.replace(match[0], css);
    }
    return source;
  };
}
