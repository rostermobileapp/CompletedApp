/**
 * Resolves a US/Canadian zip / postal code to a city + state (or province)
 * using zippopotam.us (free, no API key required). Same data source already
 * used for profile geocoding in routes.ts, extracted here so other features
 * (e.g. admin new-signup alerts) can reuse it without re-implementing the
 * lookup + normalization logic.
 */
export interface ZipLocation {
  city: string;
  state: string;
}

interface ZippopotamPlace {
  'place name': string;
  state: string;
  'state abbreviation': string;
}

interface ZippopotamResponse {
  places?: ZippopotamPlace[];
}

export async function lookupCityStateFromZip(zipCode: string | null | undefined): Promise<ZipLocation | null> {
  if (!zipCode || !zipCode.trim()) return null;

  try {
    // Normalize: remove spaces for Canadian codes like "T2P 3C8" -> "T2P3C8"
    const cleanZip = zipCode.trim().replace(/\s+/g, '').toUpperCase();

    let geoData: ZippopotamResponse | null = null;
    const usRes = await fetch(`https://api.zippopotam.us/us/${cleanZip}`);
    if (usRes.ok) {
      geoData = (await usRes.json()) as ZippopotamResponse;
    } else {
      const caRes = await fetch(`https://api.zippopotam.us/ca/${cleanZip}`);
      if (caRes.ok) geoData = (await caRes.json()) as ZippopotamResponse;
    }

    const place = geoData?.places?.[0];
    if (!place) return null;

    return {
      city: place['place name'],
      state: place['state abbreviation'] || place.state,
    };
  } catch (err) {
    console.error('[ZipLookup] Failed to resolve zip code (non-fatal):', err);
    return null;
  }
}
