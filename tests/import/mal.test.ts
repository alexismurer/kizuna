import { describe, expect, it, vi } from 'vitest'
import { estimateRank, nameKey, pickMatch, parseTopPage } from '../../scripts/import-mal/parse'
import { fullSizeUrl, parsePictures, searchCharacters } from '../../src/lib/mal/pictures'

const row = (id: number, name: string, kanji: string, anime: number[], manga: number[], fav: string) => `
<tr class="ranking-list"> <td class="rank "> <span class="lightLink pepole-rank-text rank3">101</span> </td>
<td class="people"> <a class="fl-l ml12 mr8" href="https://myanimelist.net/character/${id}/X" id="#area" rel="#info">
<img width="50" height="78" alt="${name}" class="lazyload" border="0" data-src="https://cdn.myanimelist.net/r/50x78/images/characters/11/${id}9.jpg?s=1e2d" /> </a>
<div class="information mt24"> <a href="https://myanimelist.net/character/${id}/X" class="fs14 fw-b">${name}</a>${kanji ? `<div class="fs12 fn-grey6 text-ellipsis">(${kanji})</div>` : ''}</div> </td>
<td class="animeography">${anime.map((a) => `<div class="title"><a href="https://myanimelist.net/anime/${a}/T">T</a></div>`).join('')}</td>
<td class="mangaography">${manga.map((a) => `<div class="title"><a href="https://myanimelist.net/manga/${a}/T">T</a></div>`).join('')}</td>
<td class="favorites"> ${fav} </td> </tr>`

describe('parseTopPage', () => {
  it('reads id, name, kanji, appearances, favorites and the main picture of every row', () => {
    const html = `<table>${row(64769, 'Hinata, Shouyou', '日向 翔陽', [20583, 28891], [30987], '19,743')}${row(5, 'Kuro &amp; Shiro&#039;s cat', '', [], [7], '12')}</table>`
    expect(parseTopPage(html)).toEqual([
      {
        malId: 64769,
        name: 'Hinata, Shouyou',
        kanji: '日向 翔陽',
        anime: [20583, 28891],
        manga: [30987],
        favorites: 19743,
        image: 'https://cdn.myanimelist.net/images/characters/11/647699.jpg',
      },
      { malId: 5, name: "Kuro & Shiro's cat", kanji: null, anime: [], manga: [7], favorites: 12, image: 'https://cdn.myanimelist.net/images/characters/11/59.jpg' },
    ])
  })
})

describe('name matching', () => {
  it('ignores order, punctuation, accents and long-vowel spelling', () => {
    expect(nameKey('Hinata, Shouyou')).toBe(nameKey('Shoyo Hinata'))
    expect(nameKey('Monkey D., Luffy')).toBe(nameKey('Monkey D. Luffy'))
    expect(nameKey('Rem')).not.toBe(nameKey('Ram'))
  })

  it('picks the one AniList character with the same native or romanized name', () => {
    const al = (id: number, full: string, native: string | null, alternative: string[] = []) => ({ id, name: { full, native, alternative } })
    const list = [al(1, 'Tobio Kageyama', '影山飛雄'), al(2, 'Shouyou Hinata', '日向翔陽'), al(3, 'Natsu Hinata', '日向夏')]
    expect(pickMatch({ name: 'Hinata, Shouyou', kanji: null }, list)?.id).toBe(2)
    expect(pickMatch({ name: 'Hinata, S.', kanji: '日向 翔陽' }, list)?.id).toBe(2)
    expect(pickMatch({ name: 'Sugawara, Koushi', kanji: null }, list)).toBeNull()
    // two equally good matches are not guessed
    expect(pickMatch({ name: 'Hinata', kanji: null }, [al(4, 'Hinata', null), al(5, 'Hinata', null)])).toBeNull()
    expect(pickMatch({ name: 'Hinata', kanji: null }, [al(4, 'Someone', null, ['Hinata'])])?.id).toBe(4)
  })
})

describe('estimateRank', () => {
  it('places a character after every card with more AniList favourites', () => {
    const favs = [900, 500, 500, 100]
    expect(estimateRank(1000, favs)).toBe(1)
    expect(estimateRank(500, favs)).toBe(2)
    expect(estimateRank(50, favs)).toBe(5)
  })
})

describe('MAL pictures', () => {
  it('lists each gallery picture once, without the og:image or thumbnails', () => {
    const html = `<meta property="og:image" content="https://cdn.myanimelist.net/images/characters/9/1.jpg">
      <a href="https://cdn.myanimelist.net/images/characters/9/1.jpg" title="L" class="js-picture-gallery" rel="gallery-character"><img data-src="https://cdn.myanimelist.net/images/characters/9/1.jpg"></a>
      <a href="https://cdn.myanimelist.net/images/characters/2/22.jpg" title="L" class="js-picture-gallery" rel="gallery-character"></a>
      <a href="https://cdn.myanimelist.net/images/characters/2/22.jpg" title="L" class="js-picture-gallery" rel="gallery-character"></a>`
    expect(parsePictures(html)).toEqual([
      'https://cdn.myanimelist.net/images/characters/9/1.jpg',
      'https://cdn.myanimelist.net/images/characters/2/22.jpg',
    ])
  })

  it('turns a thumbnail into the full-size picture', () => {
    expect(fullSizeUrl('https://cdn.myanimelist.net/r/50x78/images/characters/11/243919.jpg?s=1e2d')).toBe(
      'https://cdn.myanimelist.net/images/characters/11/243919.jpg',
    )
    expect(fullSizeUrl('https://cdn.myanimelist.net/images/questionmark_23.gif')).toBeNull()
  })
})

describe('MAL character search', () => {
  it('reads the quick-search answer, most favourited first, without placeholder pictures', async () => {
    const items = [
      { id: 1905, name: 'Rem', image_url: 'https://cdn.myanimelist.net/images/characters/5/1.jpg', payload: { related_works: ['Death Note'], favorites: 724 } },
      { id: 118763, name: 'Rem', image_url: 'https://cdn.myanimelist.net/images/characters/9/2.jpg', payload: { related_works: ['Re:Zero'], favorites: 48640 } },
      { id: 205041, name: 'Rem', image_url: 'https://cdn.myanimelist.net/images/questionmark_23.gif' },
    ]
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ categories: [{ type: 'character', items }] })))
    try {
      const r = await searchCharacters('Rem')
      expect(String(spy.mock.calls[0][0])).toContain('keyword=Rem')
      expect(r.map((m) => m.malId)).toEqual([118763, 1905, 205041])
      expect(r[0]).toEqual({ malId: 118763, name: 'Rem', imageUrl: items[1].image_url, works: ['Re:Zero'], favorites: 48640 })
      expect(r[2]).toMatchObject({ imageUrl: null, works: [], favorites: 0 })
    } finally {
      spy.mockRestore()
    }
  })
})
