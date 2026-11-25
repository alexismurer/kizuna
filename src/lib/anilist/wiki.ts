// A card's wiki details from AniList (favourites, age, voice actor, appearances).
// Shared by `npm run wiki:backfill` and the staff "Add as card" action.

export type CharacterDetails = {
  id: number;
  favourites: number;
  age: string | null;
  media: {
    edges: {
      voiceActors: { name: { full: string } }[];
      node: { type: "ANIME" | "MANGA"; title: { english: string | null; romaji: string | null } };
    }[];
  };
};

export const CHARACTER_DETAILS_QUERY = `query ($ids: [Int]) {
    Page(page: 1, perPage: 50) {
      characters(id_in: $ids) {
        id
        favourites
        age
        media(sort: POPULARITY_DESC, perPage: 25) {
          edges {
            voiceActors(language: JAPANESE, sort: RELEVANCE) { name { full } }
            node { type title { english romaji } }
          }
        }
      }
    }
  }`;

export type WikiRow = {
  favourites: number;
  age: string | null;
  voice_actor: string | null;
  appearances: { position: number; media_type: "ANIME" | "MANGA"; title: string }[];
};

export function toWikiRow(c: CharacterDetails): WikiRow {
  const edges = c.media.edges;
  const appearances: WikiRow["appearances"] = [];
  for (const e of edges) {
    const title = e.node.title.english ?? e.node.title.romaji;
    if (!title) continue;
    appearances.push({ position: appearances.length + 1, media_type: e.node.type, title });
  }
  return {
    favourites: c.favourites,
    age: c.age?.trim() || null,
    voice_actor: edges.find((e) => e.voiceActors.length > 0)?.voiceActors[0].name.full ?? null,
    appearances,
  };
}

// one character, one request, no retry: callers fall back to the backfill when it fails
export async function fetchCharacterWiki(anilistId: number): Promise<WikiRow | null> {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: CHARACTER_DETAILS_QUERY, variables: { ids: [anilistId] } }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`anilist_${res.status}`);
  const json = (await res.json()) as { data?: { Page: { characters: CharacterDetails[] } } };
  const c = json.data?.Page.characters.find((x) => x.id === anilistId);
  return c ? toWikiRow(c) : null;
}
