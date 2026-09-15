# Partner banners

Partner banners are configured in `client/src/config/partnerBanners.ts`.

To add a banner:

1. Upload the image file into `attached_assets`.
2. Add an import using the `@assets/<filename>` alias.
3. Add a catalog entry with a unique `id`, partner `name`, imported `image`,
   destination `href`, accessible `alt` text, `active: true`, and the next
   `order` value.
4. Run `npm run build` to catch missing asset imports and other build errors.
5. Set `active: false` when a banner should stop rotating without removing its
   configuration.

The app selects the active banner from the UTC hour number modulo the ordered
active banner count. This means every user sees the same banner during an hour,
refreshes do not restart the sequence, and banners rotate evenly. An app that
stays open updates at the next UTC hour boundary.

The current banner still follows the existing placement rules:

- Free users see it above mobile bottom navigation, except on Messages and
  Subscription.
- Player Pro users see it in the Profile header.