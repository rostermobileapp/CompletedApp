export const BEER_ME_TIERS = [
  { tier: "bronze", threshold: 1, imagePath: "/badges/beer-me/tier-1.webp" },
  { tier: "silver", threshold: 10, imagePath: "/badges/beer-me/tier-2.webp" },
  { tier: "gold", threshold: 25, imagePath: "/badges/beer-me/tier-3.webp" },
  { tier: "platinum", threshold: 50, imagePath: "/badges/beer-me/tier-4.webp" },
  { tier: "legend", threshold: 100, imagePath: "/badges/beer-me/tier-5.webp" },
  { tier: "god_mode", threshold: 250, imagePath: "/badges/beer-me/tier-6.webp" },
] as const;