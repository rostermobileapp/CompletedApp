// Shared by the catalog seed and the development artwork preview.
export const THREE_STARS_TIERS = [
  { tier: "bronze", threshold: 5, imagePath: "/badges/three-stars/tier-1.webp" },
  { tier: "silver", threshold: 10, imagePath: "/badges/three-stars/tier-2.webp" },
  { tier: "gold", threshold: 15, imagePath: "/badges/three-stars/tier-3.webp" },
  { tier: "platinum", threshold: 25, imagePath: "/badges/three-stars/tier-4.webp" },
  { tier: "diamond", threshold: 50, imagePath: "/badges/three-stars/tier-5.webp" },
] as const;