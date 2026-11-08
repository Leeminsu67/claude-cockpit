// JSX-free: covers as Segs, so the pane's box rows carry them like any text.
import type { Seg } from '../segs.ts'
import { fromBase64Url } from '../link.ts'

export type Art = { w: number; h: number; rgb: Uint8Array }

// The local artUrl is the 640 px cover (~130 KB); the 64 px one (~3 KB) is enough for 20×20.
export function smallArtUrl(url: string): string {
  const m = /^https:\/\/open\.spotify\.com\/image\/([0-9a-f]+)$/.exec(url)
  return (m ? `https://i.scdn.co/image/${m[1]}` : url).replace(/^(https:\/\/i\.scdn\.co\/image\/)ab67616d0000b273/, '$1ab67616d00004851')
}

// YouTube Music's covers sit on Google's image servers, which glowup's helper does not fetch from. On macOS curl
// fetches them and sips writes a BMP; the URL reaches the script as $1, never inside it.
const YTM_ART_HOST = /^(i\d?\.ytimg\.com|(lh|yt)\d\.(googleusercontent|ggpht)\.com)$/
export function isYtmArt(url: string): boolean {
  try { const u = new URL(url); return u.protocol === 'https:' && YTM_ART_HOST.test(u.hostname) } catch { return false }
}
const YTM_ART_SH = [
  'd=$(mktemp -d) || exit 1',
  `trap 'rm -rf "$d"' EXIT`,
  'curl -sf --proto =https --max-time 10 --max-filesize 5000000 -o "$d/a" "$1" && sips -Z 256 -s format bmp "$d/a" --out "$d/b.bmp" >/dev/null && base64 -i "$d/b.bmp"',
].join('\n')
export const ytmArtArgv = (url: string) => ['/bin/sh', '-c', YTM_ART_SH, 'sh', url]

// A 24-bit BMP, base64, averaged down to size × size from its middle square. A thumbnail that is not square is a
// video's, letterboxed in black, so its all-dark rows go first.
export function bmpCover(b64: string, size: number): Art | undefined {
  let b: Uint8Array
  try { b = fromBase64Url(b64.replace(/\s/g, '').replace(/\+/g, '-').replace(/\//g, '_')) } catch { return undefined }
  if (b.length < 54 || b[0] !== 0x42 || b[1] !== 0x4d) return undefined
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const off = v.getUint32(10, true), w = v.getInt32(18, true), hs = v.getInt32(22, true), h = Math.abs(hs)
  const stride = Math.ceil((w * 3) / 4) * 4
  if (v.getUint16(28, true) !== 24 || v.getUint32(30, true) !== 0 || w <= 0 || h <= 0 || off + stride * h > b.length) return undefined
  // BGR, rows bottom-up unless the height is negative
  const at = (x: number, y: number) => off + (hs < 0 ? y : h - 1 - y) * stride + x * 3
  const dark = (y: number) => { for (let x = 0; x < w; x++) { const i = at(x, y); if (b[i]! > 24 || b[i + 1]! > 24 || b[i + 2]! > 24) return false } return true }
  let top = 0, bottom = h
  if (w !== h) { while (top < bottom && dark(top)) top++; while (bottom > top && dark(bottom - 1)) bottom-- }
  if (top === bottom) { top = 0; bottom = h }
  const side = Math.min(w, bottom - top), x0 = Math.floor((w - side) / 2), y0 = top + Math.floor((bottom - top - side) / 2)
  const span = (k: number, o: number) => { const a = o + Math.floor((k * side) / size); return [a, Math.max(a + 1, o + Math.floor(((k + 1) * side) / size))] as const }
  const rgb = new Uint8Array(size * size * 3)
  for (let y = 0; y < size; y++) {
    const [ya, yb] = span(y, y0)
    for (let x = 0; x < size; x++) {
      const [xa, xb] = span(x, x0)
      let r = 0, g = 0, bl = 0
      for (let sy = ya; sy < yb; sy++) for (let sx = xa; sx < xb; sx++) { const i = at(sx, sy); bl += b[i]!; g += b[i + 1]!; r += b[i + 2]! }
      const n = (yb - ya) * (xb - xa), o = (y * size + x) * 3
      rgb[o] = Math.round(r / n); rgb[o + 1] = Math.round(g / n); rgb[o + 2] = Math.round(bl / n)
    }
  }
  return { w: size, h: size, rgb }
}

export function parseArt(stdout: string): Art | undefined {
  try {
    const o = JSON.parse(stdout) as { w?: unknown; h?: unknown; rgb?: unknown }
    if (!Number.isInteger(o.w) || !Number.isInteger(o.h) || typeof o.rgb !== 'string') return undefined
    const w = o.w as number, h = o.h as number, rgb = fromBase64Url(o.rgb)
    return w > 0 && h > 0 && rgb.length === w * h * 3 ? { w, h, rgb } : undefined
  } catch { return undefined }
}

const hex = (b: Uint8Array, i: number) => '#' + [b[i]!, b[i + 1]!, b[i + 2]!].map(v => v.toString(16).padStart(2, '0')).join('')

export function coverRows(a: Art): Seg[][] {
  const rows: Seg[][] = []
  for (let y = 0; y + 1 < a.h; y += 2) {
    const row: Seg[] = []
    for (let x = 0; x < a.w; x++) {
      const color = hex(a.rgb, (y * a.w + x) * 3), bg = hex(a.rgb, ((y + 1) * a.w + x) * 3), last = row.at(-1)
      if (last && last.color === color && last.bg === bg) last.text += '▀'
      else row.push({ text: '▀', color, bg })
    }
    rows.push(row)
  }
  return rows
}

export function coverPlaceholder(cols: number, rows: number, color: string): Seg[][] {
  const mid = Math.floor((cols - 1) / 2)
  return Array.from({ length: rows }, (_, y) => [{ text: y === 1 ? ' '.repeat(mid) + '♪' + ' '.repeat(cols - mid - 1) : ' '.repeat(cols), color }])
}

// null marks a cover that failed, so it is not fetched again this session.
export class ArtCache {
  private m = new Map<string, Seg[][] | null>()
  constructor(private max = 20) {}
  has(k: string) { return this.m.has(k) }
  get(k: string) { return this.m.get(k) }
  set(k: string, v: Seg[][] | null) {
    this.m.delete(k)
    this.m.set(k, v)
    if (this.m.size > this.max) this.m.delete(this.m.keys().next().value!)
  }
}
