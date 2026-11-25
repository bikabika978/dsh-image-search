// 测 AnimeTrace 对主流角色的识别率 + model 参数是否影响结果
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function grab(tag) {
  const list = await (await fetch('https://safebooru.org/index.php?page=post&s=list&tags=' + encodeURIComponent(tag), { headers: { 'user-agent': UA } })).text()
  const thumbs = [...list.matchAll(/https?:\/\/[^"'\s]*(?:thumbnails|images)[^"'\s]*?\.(?:jpg|png|webp)/g)].map((m) => m[0])
  const full = thumbs.map((t) => t.replace('/thumbnails/', '/images/').replace('thumbnail_', ''))
  for (const u of full.slice(0, 4)) {
    const r = await fetch(u, { headers: { 'user-agent': UA, referer: 'https://safebooru.org/' } })
    if (!r.ok) continue
    const b = new Uint8Array(await r.arrayBuffer())
    if (b.length < 100000) continue
    return { url: u, bytes: b, mime: r.headers.get('content-type') || 'image/jpeg' }
  }
  return undefined
}

async function ask(label, img, query = '', field = 'file') {
  const f = new FormData()
  f.append(field, new Blob([img.bytes], { type: img.mime }), 'image.jpg')
  const r = await fetch('https://api.animetrace.com/v1/search' + query, {
    method: 'POST',
    headers: { 'user-agent': UA, origin: 'https://www.animetrace.com', referer: 'https://www.animetrace.com/' },
    body: f,
  })
  const j = await r.json()
  if (j.code !== 0) return console.log(`[${label}] ${r.status} code=${j.code} ${j.zh_message || j.msg}`)
  const top = j.data?.[0]
  console.log(`[${label}] ${r.status} not_confident=${top?.not_confident} | ` +
    (top?.character || []).slice(0, 3).map((c) => `${c.character}(${c.work})`).join(' ; '))
}

for (const tag of ['rem_(re:zero)', 'uzumaki_naruto']) {
  const img = await grab(tag)
  if (!img) { console.log('skip', tag); continue }
  console.log(`\n### ${tag} ${img.bytes.length}B ${img.url.slice(-40)}`)
  await ask(tag + ' plain', img)
  await sleep(2500)
  await ask(tag + ' model=q', img, '?model=animetrace-yuri-4.2')
  await sleep(2500)
}
