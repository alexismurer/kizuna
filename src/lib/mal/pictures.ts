// MyAnimeList character galleries, read from the public pictures page (Jikan, MAL's usual
// JSON mirror, was unreachable when this was built). Used by the staff panel and `npm run mal:sync`.

export const MAL_PICTURE_PREFIX = "https://cdn.myanimelist.net/images/characters/";
export const MAL_HEADERS = { "User-Agent": "kizuna-card-art/1.0 (card picture picker)" };

export const picturesPageUrl = (malId: number) => `https://myanimelist.net/character/${malId}/x/pics`;

// the gallery is the set of links tagged js-picture-gallery; the og:image and sidebar repeat the first one
export function parsePictures(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a href="(https:\/\/cdn\.myanimelist\.net\/images\/characters\/[^"?]+)"[^>]*class="js-picture-gallery"/g)) {
    out.add(m[1]);
  }
  return [...out];
}

// MAL serves thumbnails as /r/<w>x<h>/images/characters/...?s=…; this returns the full-size picture
export function fullSizeUrl(url: string): string | null {
  const m = url.match(/images\/characters\/(\d+\/\d+\.(?:jpg|jpeg|png|webp))/);
  return m ? MAL_PICTURE_PREFIX + m[1] : null;
}

export async function fetchPictures(malId: number): Promise<string[]> {
  const res = await fetch(picturesPageUrl(malId), { headers: MAL_HEADERS, cache: "no-store" });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`mal_${res.status}`);
  return parsePictures(await res.text());
}
