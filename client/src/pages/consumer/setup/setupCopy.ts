import type { ConsumerSetupStep } from "@0xnovelagent/shared/types/consumerSetup";

export const activeSetupSteps = [
  "story_direction",
  "book_skeleton",
  "volume_plan",
  "current_phase",
  "first_chapter",
] as const satisfies readonly Exclude<ConsumerSetupStep, "completed">[];

export const setupCopy: Record<
  Exclude<ConsumerSetupStep, "completed">,
  {
    label: string;
    title: string;
    description: string;
    generateAction: string;
    confirmAction: string;
  }
> = {
  story_direction: {
    label: "故事方向",
    title: "先看看这个故事可以怎么发展",
    description: "会给出三个不同的故事方向，你只需要选一个最想继续读的。",
    generateAction: "生成三个故事方向",
    confirmAction: "就写这个",
  },
  book_skeleton: {
    label: "全书骨架",
    title: "搭好整本故事的主线",
    description: "会确定主角从开篇到结局的变化，以及整本书的重要转折。",
    generateAction: "生成全书骨架",
    confirmAction: "确认这套故事骨架",
  },
  volume_plan: {
    label: "全部卷规划",
    title: "安排每一卷要完成什么",
    description: "会把整本故事分成几个清晰阶段，让后续章节持续向结局推进。",
    generateAction: "生成全部卷规划",
    confirmAction: "确认这套卷规划",
  },
  current_phase: {
    label: "当前剧情阶段",
    title: "把开篇几章安排清楚",
    description: "只细化眼前需要写的剧情，不会一次堆出整本书的逐章表格。",
    generateAction: "生成开篇推进计划",
    confirmAction: "确认开篇计划",
  },
  first_chapter: {
    label: "第一章",
    title: "写出第一章",
    description: "会根据前面确认的内容写出完整正文，确认前不会覆盖你的作品。",
    generateAction: "生成第一章",
    confirmAction: "这章可以，进入创作台",
  },
};
