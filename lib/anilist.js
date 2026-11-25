/** AniList 出处页解析：作品名/角色名 → anilist.co 页面。免费、无 Key。 */
const ENDPOINT = 'https://graphql.anilist.co'
const TTL = 7 * 24 * 3600 * 1000
const memo = new Map()

async function gql(query, variables, { signal, userAgent, timeoutMs = 15000 }) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': userAgent },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)].filter(Boolean)),
  })
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`)
  const json = await res.json()
  if (json.errors?.length) throw new Error(`AniList：${json.errors[0]?.message || '查询失败'}`)
  return json.data
}

function memoize(key, producer) {
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.value
  return undefined
}

export async function lookupAnime(title, opts) {
  const name = String(title || '').trim()
  if (!name) return undefined
  const key = `anime:${name}`
  const cached = memoize(key)
  if (cached !== undefined) return cached
  const data = await gql(
    'query($s:String){Page(perPage:3){media(search:$s,type:ANIME){id siteUrl title{romaji native english}}}}',
    { s: name },
    opts,
  ).catch(() => undefined)
  const media = data?.Page?.media?.[0]
  const value = media
    ? { id: media.id, url: media.siteUrl, title: media.title?.romaji || media.title?.native || name }
    : undefined
  memo.set(key, { at: Date.now(), value })
  return value
}

export async function lookupCharacter(name, opts) {
  const full = String(name || '').trim()
  if (!full) return undefined
  const key = `character:${full}`
  const cached = memoize(key)
  if (cached !== undefined) return cached
  const data = await gql(
    'query($s:String){Page(perPage:3){characters(search:$s){id siteUrl name{full native}}}}',
    { s: full },
    opts,
  ).catch(() => undefined)
  const character = data?.Page?.characters?.[0]
  const value = character
    ? { id: character.id, url: character.siteUrl, name: character.name?.full || character.name?.native || full }
    : undefined
  memo.set(key, { at: Date.now(), value })
  return value
}
