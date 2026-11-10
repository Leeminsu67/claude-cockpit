// claude-mods: 이미지 미리보기: 입력창 위에 붙여 넣은 이미지의 썸네일을 띄우고, #N 버튼을 누르면 오른쪽에 크게 보여 준다.
// 엔진은 입력 중인 이미지의 파일을 알려 주지 않는다. 그런데 Claude Code는 붙여 넣는 순간 그 이미지를
// <CLAUDE_CODE_TMPDIR 또는 /tmp>/claude-<uid>/<프로젝트>/<세션 id>/images/<N>.<확장자>에 쓰므로 [Image #N]을 <N>.png와 짝짓는다.
// ponytail: PNG만 그린다(Image의 file 소스가 PNG뿐이다). 끌어다 놓은 JPEG·GIF는 썸네일이 안 뜬다
import { atom, read, update } from 'claude-code'
import type { EngineInterface, ImageSource, On } from 'claude-code'

export type Img = { path: string; width?: number; height?: number }

const VIEW = 'image-view'
const TAG = /\[Image #(\d+)\]/g
const WAITS = [0, 100, 200, 400, 800] // 파일은 붙여 넣은 뒤 비동기로 써진다

const images = atom({ plugin: 'cockpit', key: 'images' } as const, {} as Record<string, Img>)
const draft = atom({ plugin: 'cockpit', key: 'draft' } as const, [] as number[])
const viewing = atom({ plugin: 'cockpit', key: 'viewing' } as const, null as number | null)

export const tags = (text: string) => [...text.matchAll(TAG)].map(m => Number(m[1]))

/** 번호 중 이 세션 폴더(dir)에 <N>.png가 있는 것의 경로 */
export const pngsOf = (nums: number[], dir: string, names: string[]) =>
  nums.filter(n => names.includes(`${n}.png`)).map(n => [n, `${dir}/${n}.png`] as const)

/** 칸 안에 비율을 지켜 넣는다. 터미널 한 칸은 세로가 가로의 약 2배다 */
export function fit(img: Img, maxColumns: number, maxRows: number) {
  const ratio = img.width && img.height ? img.height / img.width : 10 / 16
  const columns = Math.max(1, Math.min(255, maxColumns, Math.round((maxRows * 2) / ratio)))
  const rows = Math.max(1, Math.min(255, maxRows, Math.round((columns * ratio) / 2)))
  return { columns, rows }
}

// 그림은 파일 경로가 아니라 바이트로 보낸다. Herdr는 kitty 그래픽의 파일 경로 전송(t=f)을 그리지 않는다(herdr-app#302)
// ponytail: 엔진이 받는 바이트는 2MiB까지다(이 맥에서 붙여 넣은 34장 중 최대 0.8MB). 넘는 그림이 생기면 줄여서 보낼 것
const pngs = new Map<string, string>()
async function pngOf($: EngineInterface, path: string) {
  if (pngs.has(path)) return pngs.get(path)
  const base64 = await ($.fs.read(path, { as: 'bytes' }) as Promise<{ base64: string }>).then(r => r.base64, () => '')
  if (atob(base64.slice(-16)).includes('IEND')) pngs.set(path, base64) // 다 써진 파일만(끝의 IEND) 기억하고 보낸다
  return pngs.get(path)
}

// 바이트를 아직 못 읽었으면 파일 경로로 둔다(Ghostty·kitty는 이것도 그린다)
const sourceOf = async ($: EngineInterface, path: string): Promise<ImageSource> => {
  const png = await pngOf($, path)
  return png ? { png } : { file: path, format: 'png' }
}

// PNG 머리(IHDR)의 가로·세로. 못 읽으면 비율 없이 둔다
async function pngSize($: EngineInterface, path: string): Promise<Partial<Img>> {
  try {
    const base64 = await pngOf($, path)
    if (!base64) return {}
    const head = atob(base64.slice(0, 32))
    const u32 = (at: number) => ((head.charCodeAt(at) << 24) | (head.charCodeAt(at + 1) << 16) | (head.charCodeAt(at + 2) << 8) | head.charCodeAt(at + 3)) >>> 0
    return { width: u32(16), height: u32(20) }
  } catch {
    return {}
  }
}

let lastDraft: number[] = []
let found: { session: string; dir: string } | undefined

// 이 세션의 이미지 폴더. 프로젝트 폴더 이름은 길면 해시가 붙고 /cd로 바뀌므로, 세션 id 폴더가 있는 곳을 찾는다
async function imagesDir($: EngineInterface) {
  const session = await $.session.id()
  if (found?.session === session) return found.dir
  const uid = (await $.process.run(['id', '-u']).catch(() => undefined))?.stdout.trim()
  if (!uid) return ''
  const root = `${((await $.env.get('CLAUDE_CODE_TMPDIR')) || '/tmp').replace(/\/+$/, '')}/claude-${uid}`
  for (const d of await $.fs.list(root).catch(() => [])) {
    const dir = `${root}/${d.name}/${session}/images`
    if (d.kind === 'dir' && (await $.fs.exists(dir).catch(() => false))) return (found = { session, dir }).dir
  }
  return ''
}

// 입력창 글이 바뀔 때: 지금 있는 [Image #N] 목록을 남기고, 새 번호는 이 세션 폴더의 <N>.png와 짝짓는다
async function track($: EngineInterface, text: string) {
  const nums = tags(text)
  if (nums.length !== lastDraft.length || nums.some((n, i) => n !== lastDraft[i])) {
    lastDraft = nums
    await update($, draft, () => nums)
  }
  for (const wait of WAITS) {
    if (wait) await $.clock.sleep(wait)
    const dir = await imagesDir($)
    const known = await read($, images)
    const fresh = nums.filter(n => known[n]?.path !== `${dir}/${n}.png`) // 세션이 바뀌면 같은 번호도 다시 찾는다
    if (!fresh.length) return
    if (!dir) continue
    const names = (await $.fs.list(dir).catch(() => [])).map(f => f.name)
    const added: Record<string, Img> = {}
    for (const [n, path] of pngsOf(fresh, dir, names)) added[n] = { path, ...(await pngSize($, path)) }
    if (Object.keys(added).length) await update($, images, m => ({ ...m, ...added }))
    if (fresh.every(n => names.some(f => f.startsWith(`${n}.`)))) return // PNG가 아닌 것도 다 써졌으면 더 안 기다린다
  }
}

async function openView($: EngineInterface, n: number) {
  await update($, viewing, () => n)
  await $.ui.open({ id: VIEW, title: `이미지 #${n}`, focus: true, closeOnEscape: true, columns: 120 })
}

export function registerImages(on: On) {
  // 붙여 넣기·지우기·보내기 뒤 비우기는 prompt.change로, 손으로 지우는 것은 prompt.edit로 온다
  on('prompt.change', async ($, e, next) => {
    const r = await next(e)
    void track($, e.text) // 파일을 기다리는 동안 입력을 붙잡지 않는다
    return r
  }).catch(($, e, next) => next(e))

  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    void track($, e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end))
    return r
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const map = await read($, images)
    const shown = (await read($, draft)).filter(n => map[n])
    if (!shown.length) return next(e)

    const below = await next(e)
    const { Box, Button, Image } = $.ui.resolve(e)
    const thumb = Math.max(2, Math.min(5, e.props.maxRows - 4))
    const sources = await Promise.all(shown.map(n => sourceOf($, map[n]!.path)))
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {shown.map((n, i) => {
            const img = map[n]!
            return (
              <Box flexDirection="column" alignItems="center" borderStyle="round" paddingX={1}>
                <Image source={sources[i]!} {...fit(img, 14, thumb)} alt={`#${n}`} />
                <Button key={`image-${n}`} plain onPress={() => openView($, n)}>
                  #{n}
                </Button>
              </Box>
            )
          })}
        </Box>
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: VIEW }, async ($, e) => {
    const n = await read($, viewing)
    const img = n === null ? undefined : (await read($, images))[n]
    if (!img || e.surface !== 'terminal') {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>{img ? img.path : '보여 줄 이미지가 없습니다.'}</Text>
    }
    const { Box, Text, Image } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Image source={await sourceOf($, img.path)} {...fit(img, e.props.bodyColumns, e.props.scroll.bodyRows - 1)} alt={`이미지 #${n}`} />
        <Text dimColor>Esc로 닫기</Text>
      </Box>
    )
  })
}
