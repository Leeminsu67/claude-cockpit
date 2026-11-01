// claude-mods: 진행판. Claude가 요청마다 목표와 작업 목록을 올리고 하나씩 완료 처리하면 glowup Plan 탭에 그린다.
// 기본 할 일 도구(TaskCreate 등)는 최신 모델에서 꺼져 있어 progress 도구를 직접 등록한다.
// 여기는 계산과 등록만 한다. glowup 모델에 넣고 탭을 바꾸는 일은 register.tsx의 claude-mods 구역이 한다.
import type { On, PluginOptions, ToolSpec } from 'claude-code'

import type { PlanItem } from './events.ts'

export const BOARD_TOOL = 'mcp__cockpit__progress'

export type Status = 'todo' | 'doing' | 'done'
export type Task = { title: string; note?: string; status: Status }
export type Board = { goal: string; tasks: Task[] }
export type BoardInput = { goal?: string; tasks?: string[]; start?: number; done?: number; note?: string }

const RULE = `## 진행판
사용자 화면 오른쪽 cockpit 패널의 Plan 탭에 진행판이 있다. 모든 요청에서 다른 도구를 쓰거나 답하기 전에 ${BOARD_TOOL} 도구로 goal(요청을 한 줄로 요약)과 tasks(작업 목록)를 먼저 올린다. 질문에 답만 하는 요청도 작업 1개로 올린다.
작업은 예정 → 진행 중 → 완료로 바뀐다. 첫 작업은 올리자마자 진행 중이 되고, done(번호)과 note(무엇을 어떻게 했는지 한 줄)로 완료하면 다음 예정 작업이 진행 중이 된다. 순서를 건너뛸 때만 start(번호)로 진행 중을 직접 정한다. 계획이 바뀌면 tasks를 다시 올린다. 글은 한국어로 쓴다.`

const setStatus = (tasks: Task[], n: number, status: Status, note?: string) =>
  tasks.map((t, i) => (i === n - 1 ? { ...t, status, ...(note !== undefined && { note }) } : t))
// 진행 중이 하나도 없으면 첫 예정 작업을 진행 중으로 올린다
const advance = (tasks: Task[]) => {
  const next = tasks.findIndex(t => t.status === 'todo')
  return tasks.some(t => t.status === 'doing') || next < 0 ? tasks : setStatus(tasks, next + 1, 'doing')
}

/** 도구 입력 하나를 계획에 적용한다. 거부할 때는 error에 이유를 담고 계획은 그대로 돌려준다 */
export function applyProgress(prev: Board | null, input: BoardInput): { board: Board | null; error?: string } {
  const { goal, tasks, start, done, note } = input
  let p = prev
  if (tasks?.length) p = { goal: goal ?? '', tasks: advance(tasks.map(title => ({ title, status: 'todo' as const }))) }
  if (start === undefined && done === undefined) return { board: p }
  if (!p) return { board: p, error: '계획이 없습니다. 먼저 goal과 tasks를 올리세요.' }
  const bad = [start, done].find(n => n !== undefined && (!Number.isInteger(n) || n < 1 || n > p!.tasks.length))
  if (bad !== undefined) return { board: p, error: `작업 번호는 1~${p.tasks.length} 사이여야 합니다.` }
  let t = p.tasks
  if (start !== undefined) t = setStatus(t, start, 'doing')
  if (done !== undefined) t = advance(setStatus(t, done, 'done', note))
  return { board: { ...p, tasks: t } }
}

export function summary(b: Board) {
  const of = (s: Status) => b.tasks.filter(t => t.status === s).length
  const percent = Math.round((of('done') * 100) / b.tasks.length)
  return `예정 ${of('todo')} · 진행 중 ${of('doing')} · 완료 ${of('done')} (${percent}%)`
}

// glowup의 PlanItem으로 바꾼다. 띠와 상태줄의 plan 표시도 이것을 읽는다
const GLOWUP_STATUS = { todo: 'pending', doing: 'in_progress', done: 'completed' } as const
export const toPlan = (b: Board): PlanItem[] =>
  b.tasks.map((t, i) => ({ id: String(i + 1), title: t.title, status: GLOWUP_STATUS[t.status], ...(t.note && { note: t.note }) }))

// 질문 카드: 선택지 이름은 제품명(PostgreSQL 등)일 수 있어 빼고, 질문과 선택지 설명만 본다
const HANGUL = /[가-힣]/
type Question = { question: string; options: { description: string }[] }
export const notKorean = (questions: Question[]) =>
  questions.flatMap(q => [q.question, ...q.options.map(o => o.description)]).find(t => t && !HANGUL.test(t))

// 도구 등록은 glowup의 session.start가 한다(session.start 훅은 mod 하나에 하나만 둘 수 있다).
// 규칙(RULE)은 설명에도 넣는다. 회사 관리 플러그인 등이 prompt.compose를 먼저 처리하고 다른 플러그인의 훅을
// 건너뛰게 하면 시스템 프롬프트 쪽 규칙은 빠지지만, 도구 설명은 그와 상관없이 모델에게 전달된다
export const BOARD_SPEC: ToolSpec = {
  name: 'progress',
  isDeferred: false,
  description: `사용자 화면 오른쪽 cockpit 패널의 Plan 탭에 있는 진행판을 갱신한다. 요청을 시작할 때 goal과 tasks로 계획을 올리고, 작업을 하나 끝낼 때마다 done과 note로 완료 처리한다. 작업은 예정, 진행 중, 완료로 보인다.\n\n${RULE}`,
  inputSchema: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: '요청을 한 줄로 요약한 목표. tasks와 함께 보낸다' },
      tasks: { type: 'array', items: { type: 'string' }, minItems: 1, description: '작업 제목 목록. 보내면 새 계획으로 바뀌고 첫 작업이 진행 중이 된다' },
      start: { type: 'integer', minimum: 1, description: '순서를 건너뛸 때만: 진행 중으로 바꿀 작업 번호 (1부터)' },
      done: { type: 'integer', minimum: 1, description: '방금 끝낸 작업 번호 (1부터). 다음 예정 작업이 자동으로 진행 중이 된다' },
      note: { type: 'string', description: 'done과 함께 보낸다. 무엇을 어떻게 했는지 한 줄' },
    },
  },
}

export function registerBoard(on: On, options: PluginOptions) {
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!e.tools.includes(BOARD_TOOL)) return composed
    return { sections: [...composed.sections, { id: 'cockpit:board-rule', text: RULE, scope: 'session' as const }] }
  })

  // /config의 '한국어 질문 카드 검사'를 끄면 그냥 지나간다(설정을 바꾸면 모듈이 새 값으로 다시 불러와진다)
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e, next) => {
    if (options.koreanQuestions === false) return next(e)
    const english = notKorean(e.questions)
    return english ? { deny: `질문과 선택지 설명은 한국어로 다시 써서 물어보세요. 한국어가 아닌 부분: "${english}"` } : next(e)
  }).catch(($, e, next) => next(e)) // 검사가 실패해도 질문은 막지 않는다
}
