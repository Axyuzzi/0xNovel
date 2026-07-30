const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildConsumerBookTitlePolicy,
  buildConsumerChapterTitlePolicy,
  buildConsumerVolumeTitlePolicy,
  normalizeConsumerChapterTitle,
} = require("../dist/prompting/prompts/consumer/consumerTitlePolicy.js");
const {
  consumerBookSkeletonPrompt,
  consumerCurrentPhasePrompt,
  consumerFirstChapterPrompt,
  consumerStoryDirectionPrompt,
  consumerVolumePlanPrompt,
} = require("../dist/prompting/prompts/consumer/consumerSetup.prompts.js");
const {
  consumerNextChapterTaskPrompt,
} = require("../dist/prompting/prompts/consumer/consumerChapterProduction.prompts.js");
const {
  consumerStoredStoryDirectionSchema,
} = require("../../shared/dist/types/consumerSetup.js");

function promptText(asset, input) {
  return asset.render(input)
    .map((message) => String(message.content))
    .join("\n");
}

const setupInput = {
  idea: "一个账房先生能看见每笔赃款最终害死的人。",
  selectedDirection: {
    id: "direction-1",
    title: "血账",
    premise: "账房先生借账目追查赃款。",
    protagonist: "落魄账房先生",
    centralConflict: "查账会牵连家人。",
    readerAppeal: "古代查账与权谋破局。",
    tone: "克制、紧张",
    development: "从一间粮铺查到朝堂。",
    coreAdvantage: "能从账目习惯识破利益链条。",
    advantageLimit: "只能发现数字异常，无法直接证明幕后身份。",
    payoffPattern: "用不起眼的账目证据反制权贵。",
    progressionPath: "从粮铺账房成长为能影响朝局的审计者。",
    recommendedLength: "约 5 卷，150 章",
    estimatedVolumes: 5,
    estimatedChapters: 150,
  },
  bookSkeleton: {
    corePromise: "从一册烂账追出整条赈粮利益链。",
    protagonistArc: "从只求自保的账房成长为敢于留下证据的人。",
    ending: "远期结局不应进入首章上下文。",
    acts: [],
    majorCharacters: [],
  },
  volumePlan: {
    volumes: [{
      order: 1,
      title: "粮仓无粮",
      goal: "查明赈粮失踪的第一层去向。",
      mainConflict: "地方官吏共同掩盖空仓。",
      turningPoint: "李衡拿到一册无法销毁的副账。",
      endingHook: "副账指向京城。",
      estimatedChapters: 24,
    }, {
      order: 2,
      title: "远期卷不应进入首章上下文",
      goal: "进入京城继续调查。",
      mainConflict: "朝堂利益集团阻止查账。",
      turningPoint: "旧案与赈粮案合并。",
      endingHook: "真相指向皇室。",
      estimatedChapters: 30,
    }],
  },
  currentPhase: {
    name: "空仓查账",
    chapterStart: 1,
    chapterEnd: 5,
    objective: "找到粮仓亏空的第一份实证。",
    openingState: "李衡被迫接手一册烂账。",
    beats: [],
    characterChanges: [],
    endingState: "李衡决定带着副账离开县城。",
  },
};

test("consumer title policies demand concrete candidates without extra output", () => {
  assert.match(buildConsumerBookTitlePolicy(), /内部构思至少 6 个候选/);
  assert.match(buildConsumerBookTitlePolicy(), /暗流涌动/);
  assert.match(buildConsumerBookTitlePolicy(), /不同句式骨架/);
  assert.match(buildConsumerVolumeTitlePolicy(), /内部构思至少 3 个候选/);
  assert.match(buildConsumerVolumeTitlePolicy(), /相邻卷不得重复/);

  const chapterPolicy = buildConsumerChapterTitlePolicy(["烂账与破局", "粮仓无粮"]);
  assert.match(chapterPolicy, /不写“第 N 章”/);
  assert.match(chapterPolicy, /烂账与破局/);
  assert.match(chapterPolicy, /不得与它们重复核心词或句式/);
});

test("consumer setup prompts carry the current title policies", () => {
  assert.equal(consumerStoryDirectionPrompt.version, "v3");
  assert.equal(consumerBookSkeletonPrompt.version, "v2");
  assert.equal(consumerVolumePlanPrompt.version, "v3");
  assert.equal(consumerCurrentPhasePrompt.version, "v2");
  assert.equal(consumerFirstChapterPrompt.version, "v5");

  assert.match(promptText(consumerStoryDirectionPrompt, setupInput), /书名要求/);
  assert.match(promptText(consumerVolumePlanPrompt, setupInput), /卷名要求/);
  assert.match(promptText(consumerFirstChapterPrompt, setupInput), /章节标题要求/);
});

test("consumer setup prompts carry genre-adaptive serial hooks and focused context", () => {
  const directionText = promptText(consumerStoryDirectionPrompt, setupInput);
  assert.match(directionText, /coreAdvantage/);
  assert.match(directionText, /advantageLimit/);
  assert.match(directionText, /payoffPattern/);
  assert.match(directionText, /不得强行为所有故事添加系统、超能力、打脸或升级换地图/);

  const phaseText = promptText(consumerCurrentPhasePrompt, setupInput);
  assert.match(phaseText, /最迟第三章兑现一次/);
  assert.match(phaseText, /粮仓无粮/);
  assert.doesNotMatch(phaseText, /远期卷不应进入首章上下文/);

  const firstChapterText = promptText(consumerFirstChapterPrompt, setupInput);
  assert.match(firstChapterText, /前 150 字直接进入/);
  assert.match(firstChapterText, /粮仓无粮/);
  assert.doesNotMatch(firstChapterText, /远期卷不应进入首章上下文/);
  assert.doesNotMatch(firstChapterText, /远期结局不应进入首章上下文/);
});

test("legacy stored directions receive safe commercial-serial defaults", () => {
  const {
    coreAdvantage,
    advantageLimit,
    payoffPattern,
    progressionPath,
  } = consumerStoredStoryDirectionSchema.parse({
    id: "legacy",
    title: "旧方向",
    premise: "旧版本方向。",
    protagonist: "旧版本主角",
    centralConflict: "旧版本冲突。",
    readerAppeal: "旧版本阅读回报。",
    tone: "克制",
    development: "旧版本长期发展。",
    recommendedLength: "约 30 章",
    estimatedVolumes: 1,
    estimatedChapters: 30,
  });

  assert.match(coreAdvantage, /旧版本主角/);
  assert.match(advantageLimit, /边界/);
  assert.equal(payoffPattern, "旧版本阅读回报。");
  assert.equal(progressionPath, "旧版本长期发展。");
});

test("next chapter task uses recent titles to prevent repetition", () => {
  assert.equal(consumerNextChapterTaskPrompt.version, "v4");
  const text = promptText(consumerNextChapterTaskPrompt, {
    novelId: "novel-1",
    targetChapterId: "chapter-2",
    novelTitle: "血账",
    idea: setupInput.idea,
    selectedDirection: setupInput.selectedDirection,
    bookSkeleton: {},
    volumePlan: {},
    currentPhase: {},
    sourceChapter: {
      order: 1,
      title: "烂账与破局",
      content: "李衡翻开账簿，发现粮仓的数字对不上。",
    },
    recentChapters: [{
      order: 1,
      title: "烂账与破局",
      content: "李衡翻开账簿，发现粮仓的数字对不上。",
    }],
  });

  assert.match(text, /章节标题要求/);
  assert.match(text, /烂账与破局/);
  assert.match(text, /不得与它们重复核心词或句式/);
});

test("chapter title normalization removes presentation-only wrappers", () => {
  assert.equal(
    normalizeConsumerChapterTitle("《第 7 章 · 账簿上的血。》"),
    "账簿上的血",
  );
  assert.equal(normalizeConsumerChapterTitle("“粮仓无粮！”"), "粮仓无粮");
  assert.equal(normalizeConsumerChapterTitle("第十二章 破门"), "破门");
  assert.equal(normalizeConsumerChapterTitle("第章"), "第章");

  const firstChapter = consumerFirstChapterPrompt.postValidate({
    title: "第1章：烂账",
    summary: "李衡发现账目有问题。",
    content: "李衡翻开账簿。",
  });
  assert.equal(firstChapter.title, "烂账");
});
