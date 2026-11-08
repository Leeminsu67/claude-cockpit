import { test, expect } from 'claude-code/testing'
import { smallArtUrl, parseArt, coverRows, coverPlaceholder, ArtCache, bmpCover, isYtmArt, ytmArtArgv } from '../hooks/music/art.ts'
import { toBase64Url } from '../hooks/link.ts'

const art = (w: number, h: number, px: number[]) => JSON.stringify({ w, h, rgb: toBase64Url(Uint8Array.from(px)) })

test('smallArtUrl asks for the 64 px cover and maps open.spotify.com/image to the CDN', () => {
  expect(smallArtUrl('https://i.scdn.co/image/ab67616d0000b27304802a3a9e155e4eaed25520')).toBe('https://i.scdn.co/image/ab67616d0000485104802a3a9e155e4eaed25520')
  expect(smallArtUrl('https://open.spotify.com/image/ab67616d0000b273ff')).toBe('https://i.scdn.co/image/ab67616d00004851ff')
  expect(smallArtUrl('https://mosaic.scdn.co/640/aa')).toBe('https://mosaic.scdn.co/640/aa')
  expect(smallArtUrl('https://i.scdn.co/image/ab6761610000e5ebcc')).toBe('https://i.scdn.co/image/ab6761610000e5ebcc')
})

test('parseArt checks the byte count; junk is undefined', () => {
  expect(parseArt(art(1, 2, [1, 2, 3, 4, 5, 6]))).toEqual({ w: 1, h: 2, rgb: Uint8Array.from([1, 2, 3, 4, 5, 6]) })
  expect(parseArt(art(2, 2, [1, 2, 3]))).toBeUndefined()
  expect(parseArt('nope')).toBeUndefined()
  expect(parseArt('{"w":0,"h":2,"rgb":""}')).toBeUndefined()
})

test('coverRows: ▀ in the top pixel over the bottom one; matching neighbours share a Seg', () => {
  const a = parseArt(art(2, 2, [255, 0, 0, 0, 0, 255, 0, 255, 0, 0, 255, 0]))!
  expect(coverRows(a)).toEqual([[{ text: '▀', color: '#ff0000', bg: '#00ff00' }, { text: '▀', color: '#0000ff', bg: '#00ff00' }]])
  const flat = parseArt(art(3, 2, Array(18).fill(16)))!
  expect(coverRows(flat)).toEqual([[{ text: '▀▀▀', color: '#101010', bg: '#101010' }]])
})

test('coverPlaceholder is cols wide and rows tall with a ♪', () => {
  const rows = coverPlaceholder(8, 4, '#ff8800')
  expect(rows.map(r => r.map(s => s.text).join(''))).toEqual(['        ', '   ♪    ', '        ', '        '])
})

test('ArtCache keeps the newest 20 and remembers a failure as null', () => {
  const c = new ArtCache(2)
  c.set('a', []); c.set('b', null); c.get('a'); c.set('c', [])
  expect([c.has('a'), c.has('b'), c.has('c')]).toEqual([false, true, true])
  expect(c.get('b')).toBeNull()
})

// A 24-bit BMP of rows (top first) of [r, g, b] pixels; bottomUp writes it the usual way, with a positive height.
function bmp(rows: number[][][], bottomUp = false): string {
  const w = rows[0]!.length, h = rows.length, stride = Math.ceil((w * 3) / 4) * 4
  const b = new Uint8Array(54 + stride * h), v = new DataView(b.buffer)
  b[0] = 0x42; b[1] = 0x4d
  v.setUint32(10, 54, true); v.setUint32(14, 40, true); v.setInt32(18, w, true); v.setInt32(22, bottomUp ? h : -h, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true)
  rows.forEach((row, y) => row.forEach(([r, g, bl], x) => { const i = 54 + (bottomUp ? h - 1 - y : y) * stride + x * 3; b[i] = bl!; b[i + 1] = g!; b[i + 2] = r! }))
  return toBase64Url(b)
}

test('YouTube Music covers: a BMP is averaged down from its middle square, past a letterbox', () => {
  const R = [200, 0, 0], B = [0, 0, 200], K = [0, 0, 0]
  // 2×2 square, either row order, to 1×1: the average
  for (const up of [false, true]) expect(bmpCover(bmp([[R, B], [B, R]], up), 1)).toEqual({ w: 1, h: 1, rgb: Uint8Array.from([100, 0, 100]) })
  // 3 wide with an odd width's row padding: top-left stays red, bottom-right blue
  const odd = bmpCover(bmp([[R, R, B], [R, B, B], [B, B, B]]), 3)!
  expect([...odd.rgb.slice(0, 3)]).toEqual(R)
  expect([...odd.rgb.slice(24, 27)]).toEqual(B)
  // a 4×4 picture letterboxed to 4×6: the black rows go, so the cover is the picture's
  const pic = [[R, R, B, B], [R, R, B, B], [B, B, R, R], [B, B, R, R]]
  expect(bmpCover(bmp([[K, K, K, K], ...pic, [K, K, K, K]]), 2)).toEqual(bmpCover(bmp(pic), 2))
  expect(bmpCover('not a bmp', 2)).toBeUndefined()
  expect(bmpCover(bmp([[R]]).slice(0, 20), 2)).toBeUndefined()
})

test('YouTube Music covers: only https Google image hosts, and the URL is an argument, not script', () => {
  expect(isYtmArt('https://i.ytimg.com/vi/x/sddefault.jpg')).toBe(true)
  expect(isYtmArt('https://lh3.googleusercontent.com/abc=w544-h544')).toBe(true)
  expect(isYtmArt('http://i.ytimg.com/vi/x/sddefault.jpg')).toBe(false)
  expect(isYtmArt('https://i.ytimg.com.evil.test/x')).toBe(false)
  expect(isYtmArt('https://i.scdn.co/image/x')).toBe(false)
  const url = "https://i.ytimg.com/vi/x';rm -rf ~;'.jpg"
  const argv = ytmArtArgv(url)
  expect(argv.at(-1)).toBe(url)
  expect(argv[2]).not.toContain(url)
})
