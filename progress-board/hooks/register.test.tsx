import { expect, test } from 'claude-code/testing'

import { fit, pair, tags } from './images'

const TOOL = 'mcp__progress-board__progress'
const PANE = {
  plugin: 'progress-board',
  component: 'Pane',
  requestId: 'progress',
  props: {
    title: '진행판',
    isFocused: false,
    bodyColumns: 36,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('예정·진행 중·완료로 나뉘고 완료하면 다음 작업이 진행 중이 된다', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))

  const planned = await $.tool.call({ tool: TOOL, goal: '검사', tasks: ['가', '나', '다'] })
  expect(planned.result).toBe('예정 2 · 진행 중 1 · 완료 0 (0%)')
  const done = await $.tool.call({ tool: TOOL, done: 1, note: '이렇게 했다' })
  expect(done.result).toBe('예정 1 · 진행 중 1 · 완료 1 (33%)')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /1\/3 · 33%/ }))?.text).toBe(' 1/3 · 33%')
    expect((await ui.find({ type: 'Text', text: /^예정/ }))?.text).toBe('예정 1')
    expect((await ui.find({ type: 'Text', text: /^진행 중/ }))?.text).toBe('진행 중 1')
    expect((await ui.find({ type: 'Text', text: /^완료/ }))?.text).toBe('완료 1')
    expect((await ui.find({ type: 'Text', text: /▶/ }))?.text).toBe('▶ 2. 나')
    expect((await ui.find({ type: 'Text', text: /이렇게 했다/ }))?.text).toBe('   이렇게 했다')
    await ui.unmount()
  }
})

test('start로 순서를 건너뛰어 진행 중을 정한다', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.tool.call({ tool: TOOL, goal: '검사', tasks: ['가', '나', '다'] })
  expect((await $.tool.call({ tool: TOOL, start: 3 })).result).toBe('예정 1 · 진행 중 2 · 완료 0 (0%)')
  // 진행 중이 남아 있으면 완료 뒤에 예정 작업을 올리지 않는다
  expect((await $.tool.call({ tool: TOOL, done: 1, note: '끝' })).result).toBe('예정 1 · 진행 중 1 · 완료 1 (33%)')
  expect((await $.tool.call({ tool: TOOL, done: 3, note: '끝' })).result).toBe('예정 0 · 진행 중 1 · 완료 2 (67%)')
})

test('없는 번호와 계획 없는 완료는 거부한다', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))

  expect((await $.tool.call({ tool: TOOL, done: 1, note: 'x' })).deny).toMatch(/계획이 없습니다/)
  await $.tool.call({ tool: TOOL, goal: '검사', tasks: ['가'] })
  expect((await $.tool.call({ tool: TOOL, done: 2, note: 'x' })).deny).toMatch(/1~1/)
})

test('영어 질문 카드는 막고 한국어 질문 카드는 통과시킨다', async ($, on) => {
  on('tool.call', () => ({ result: {} })) // 엔진 대신 답한다

  const ask = (question: string, description: string) =>
    $.tool.call({
      tool: 'AskUserQuestion',
      questions: [
        {
          question,
          header: 'DB',
          multiSelect: false,
          options: [
            { label: 'PostgreSQL', description },
            { label: 'SQLite', description: '파일 하나로 끝난다' },
          ],
        },
      ],
    })

  expect((await ask('Which database?', '가장 많이 쓴다')).deny).toMatch(/Which database\?/)
  expect((await ask('어떤 DB를 쓸까요?', 'Most popular')).deny).toMatch(/Most popular/)
  expect((await ask('어떤 DB를 쓸까요?', '가장 많이 쓴다')).deny).toBeUndefined()
})

test('붙여 넣은 순서대로 짝짓고 비율을 지켜 줄인다', () => {
  expect(tags('가 [Image #6] 나 [Image #7]')).toEqual([6, 7])
  const files = [
    { path: '/t/b.png', at: 2 },
    { path: '/t/a.png', at: 1 },
  ]
  expect(pair([7, 6], files)).toEqual([[6, '/t/a.png'], [7, '/t/b.png']])
  // 파일이 모자라면 가장 최근 번호에 가장 최근 파일을 준다
  expect(pair([6, 7], [{ path: '/t/b.png', at: 2 }])).toEqual([[7, '/t/b.png']])
  // 1600×1000 이미지를 14칸×5줄 안에: 세로가 먼저 찬다
  expect(fit({ path: '', width: 1600, height: 1000 }, 14, 5)).toEqual({ columns: 14, rows: 4 })
  expect(fit({ path: '', width: 1000, height: 1000 }, 40, 10)).toEqual({ columns: 20, rows: 10 })
})

test('입력창 위에 썸네일과 #N 버튼을 그린다', async ($, on) => {
  on('state.get', (_, e) => {
    const key = (e as { key: string }).key
    const value = key === 'draft' ? [7] : key === 'images' ? { 7: { path: '/t/a.png', width: 1600, height: 1000 } } : undefined
    return { value: { value, version: 1 } }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>엔진</Text>
  })

  const ui = await $.ui.mount({
    plugin: 'progress-board',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 80, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  })
  expect((await ui.find({ type: 'Image' }))?.props?.alt).toBe('#7')
  expect((await ui.find({ key: 'image-7' }))?.text).toBe('#7')
  expect((await ui.find({ type: 'Text', text: '엔진' }))?.text).toBe('엔진')
  await ui.unmount()
})

test('하위 에이전트의 호출은 목록을 바꾸지 않는다', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.tool.call({ tool: TOOL, goal: '메인', tasks: ['가'] })
  await $.tool.call({ tool: TOOL, agentId: 'sub', goal: '하위', tasks: ['나'] })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /메인/ }))?.text).toBe('메인')
  await ui.unmount()
})
