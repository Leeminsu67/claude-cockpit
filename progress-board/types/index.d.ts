export type Status = 'todo' | 'doing' | 'done'
export type Task = { title: string; note?: string; status: Status }
export type Plan = { goal: string; tasks: Task[] }
/** 붙여 넣은 이미지 하나: 파일 경로와, PNG 머리에서 읽은 크기(못 읽으면 없음) */
export type Img = { path: string; width?: number; height?: number }

declare module 'claude-code' {
  interface PluginState {
    'progress-board': {
      plan: Shaped<Plan | null>
      /** `[Image #N]`의 N → 이미지 */
      images: Record<string, Img>
      /** 지금 입력창에 있는 `[Image #N]`들의 N */
      draft: number[]
      /** 크게 보기 창에 띄운 N */
      viewing: number | null
    }
  }
}
