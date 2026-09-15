import hpibBannerImage from "@assets/HPIB-Red2_(1)_1768339929994.png";
import bestDamTapeBannerImage from "@assets/BDT_1_1789505101618.jpg";

export interface PartnerBanner {
  id: string;
  name: string;
  image: string;
  href: string;
  alt: string;
  active: boolean;
  order: number;
}

/**
 * Partner banner catalog.
 *
 * To add a banner:
 * 1. Upload its image into `attached_assets`.
 * 2. Import it above with the `@assets/<filename>` alias.
 * 3. Add an entry below with the next stable `order` value.
 *
 * Set `active` to false to remove a banner from rotation without deleting it.
 * The selected banner is based on the UTC hour, so ordering is shared by all
 * users and does not restart when someone refreshes the app.
 */
export const PARTNER_BANNERS: readonly PartnerBanner[] = [
  {
    id: "hpib",
    name: "Hockey Players In Business",
    image: hpibBannerImage,
    href: "https://hockeyplayersinbusiness.org/",
    alt: "Hockey Players In Business - Join for only $50/yr",
    active: true,
    order: 0,
  },
  {
    id: "best-dam-tape",
    name: "Best Dam Tape",
    image: bestDamTapeBannerImage,
    href: "https://bestdamtape.com/",
    alt: "Best Dam Tape - Get some Best Dam Tape here",
    active: true,
    order: 1,
  },
];

export const FALLBACK_PARTNER_BANNER: PartnerBanner = PARTNER_BANNERS[0] ?? {
  id: "hpib-fallback",
  name: "Hockey Players In Business",
  image: hpibBannerImage,
  href: "https://hockeyplayersinbusiness.org/",
  alt: "Hockey Players In Business - Join for only $50/yr",
  active: true,
  order: 0,
};

export const HOUR_IN_MILLISECONDS = 60 * 60 * 1000;

export function getUtcHourSlot(timestamp = Date.now()): number {
  return Math.floor(timestamp / HOUR_IN_MILLISECONDS);
}

export function getPartnerBannerForHour(
  hourSlot = getUtcHourSlot(),
): PartnerBanner {
  const activeBanners = PARTNER_BANNERS
    .filter((banner) => banner.active)
    .slice()
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  if (activeBanners.length === 0) {
    return FALLBACK_PARTNER_BANNER;
  }

  return activeBanners[((hourSlot % activeBanners.length) + activeBanners.length) % activeBanners.length];
}