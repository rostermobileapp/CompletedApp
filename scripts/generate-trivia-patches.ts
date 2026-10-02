import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TRIVIA_CATEGORIES, TRIVIA_CATEGORY_LABELS } from "../shared/trivia.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const tierColors = ["#a86b35", "#b9c0ca", "#ddb84e", "#91aeca", "#5ab092", "#8bcfe1", "#d1a4df", "#f09b62"];

function escapeXml(text: string) {
  return text.replace(/[<>&'"]/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;",
  }[character]!));
}

function patchSvg(categoryLabel: string, categoryIndex: number, tier: number): string {
  const color = tierColors[tier - 1];
  const initials = categoryLabel.split(/\s+/).map((word) => word[0]).join("").slice(0, 3);
  const angle = categoryIndex * 40 - 160;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(categoryLabel)} trivia patch, Tier ${tier}</title>
  <desc id="desc">Replaceable embroidered hockey trivia patch placeholder.</desc>
  <defs>
    <radialGradient id="cloth" cx="34%" cy="27%">
      <stop offset="0" stop-color="#29394a"/>
      <stop offset="1" stop-color="#101923"/>
    </radialGradient>
    <pattern id="thread" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})">
      <path d="M0 1h8M0 5h8" stroke="${color}" stroke-opacity=".2" stroke-width="1.1"/>
    </pattern>
    <filter id="shadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#000" flood-opacity=".42"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <path d="M128 14 153 25 181 24 197 47 222 61 222 90 241 112 232 139 238 166 217 187 208 214 181 224 161 245 134 238 108 246 87 226 59 219 48 192 27 171 34 144 19 119 34 95 34 67 58 51 72 26 100 26Z" fill="url(#cloth)" stroke="${color}" stroke-width="8" stroke-linejoin="round"/>
    <path d="M128 22 151 32 177 31 192 52 214 64 214 90 232 113 224 138 230 163 211 182 202 207 177 217 159 237 134 230 109 238 90 220 64 213 54 188 34 169 40 144 26 120 40 97 40 71 62 56 76 34 102 34Z" fill="url(#thread)" stroke="#f8e8bd" stroke-opacity=".7" stroke-width="1.5" stroke-dasharray="3 5" stroke-linejoin="round"/>
  </g>
  <circle cx="128" cy="105" r="48" fill="#172636" stroke="${color}" stroke-width="5"/>
  <circle cx="128" cy="105" r="38" fill="none" stroke="#f8e8bd" stroke-opacity=".7" stroke-width="1.5" stroke-dasharray="2 4"/>
  <text x="128" y="116" text-anchor="middle" fill="#f8e8bd" font-family="Arial, sans-serif" font-weight="800" font-size="${initials.length > 2 ? 24 : 30}" letter-spacing="2">${escapeXml(initials)}</text>
  <path d="M73 167h110" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
  <text x="128" y="188" text-anchor="middle" fill="#f8e8bd" font-family="Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="1">${escapeXml(categoryLabel.toUpperCase())}</text>
  <rect x="92" y="198" width="72" height="27" rx="13.5" fill="${color}" stroke="#f8e8bd" stroke-width="2"/>
  <text x="128" y="216" text-anchor="middle" fill="#101923" font-family="Arial, sans-serif" font-weight="900" font-size="12" letter-spacing=".7">TIER ${tier}</text>
</svg>
`;
}

async function main() {
  let created = 0;
  for (let index = 0; index < TRIVIA_CATEGORIES.length; index += 1) {
    const category = TRIVIA_CATEGORIES[index];
    const directory = join(projectRoot, "client", "public", "badges", "trivia", category);
    await mkdir(directory, { recursive: true });
    for (let tier = 1; tier <= 8; tier += 1) {
      const filePath = join(directory, `tier-${tier}.svg`);
      try {
        await writeFile(filePath, patchSvg(TRIVIA_CATEGORY_LABELS[category], index, tier), { flag: "wx" });
        created += 1;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
  }
  console.log(`[Trivia] Created ${created} replaceable embroidery placeholder(s); existing artwork was left untouched.`);
}

main().catch((error) => {
  console.error("[Trivia] Failed to generate patch placeholders:", error);
  process.exitCode = 1;
});