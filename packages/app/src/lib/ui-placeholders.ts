export const DEFERRED_TO_V0_2_TITLE = '此功能将在 v0.2 中支持';

export const DEFERRED_HISTORY_LABEL = '浏览历史（v0.2）';

export const DEFERRED_HISTORY_COPY =
  '历史浏览仍为 v0.2 占位，不会创建虚构 run 或工作区。';

export function createDeferredToV0_2Note(subject: string): string {
  return `${subject}将在 v0.2 中支持。`;
}
