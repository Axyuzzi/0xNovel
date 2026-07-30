const GENERIC_TITLE_EXAMPLES = [
  "暗流涌动",
  "风云再起",
  "危机降临",
  "危机初现",
  "真相浮现",
  "新的开始",
  "命运交织",
  "命运的齿轮",
  "意外发现",
  "艰难抉择",
] as const;

const genericTitleText = GENERIC_TITLE_EXAMPLES.join("、");

const CHAPTER_NUMBER_PREFIX =
  /^第\s*(?:\d+|[〇零一二两三四五六七八九十百千万]+)\s*章(?:\s*[·:：—-]\s*|\s*)/u;

export function normalizeConsumerChapterTitle(title: string): string {
  const original = title.trim();
  const normalized = original
    .replace(/^[“”‘’"'《》〈〉「」『』【】]+|[“”‘’"'《》〈〉「」『』【】]+$/gu, "")
    .replace(CHAPTER_NUMBER_PREFIX, "")
    .replace(/[。！？!?：:]+$/gu, "")
    .trim();

  return normalized || original;
}

export function buildConsumerBookTitlePolicy(): string {
  return `【书名要求】
1. 为每个故事方向填写 title 前，先在内部构思至少 6 个候选，从题材辨识度、核心卖点、独特性、朗读节奏和封面识别度五方面比较，只输出最合适的一个，不输出候选或比较过程。
2. title 优先为 6—16 个汉字，最长不超过 20 个字符；不加书名号，不写成简介、宣传口号或完整剧情句。
3. 书名必须同时让人感知题材方向和本故事独有的冲突、能力、规则、身份差或关键意象，不能只剩抽象气氛。
4. 禁止使用“${genericTitleText}”一类放到任何故事上都成立的空泛标题；禁止只用“传奇、风云、纪元、归来、崛起、之路”包装普通名词。
5. 不把“我在……”“开局……”“穿越后……”当成万能模板；只有这种口语框架确实承载本故事最强卖点时才可使用。
6. 三个故事方向的书名必须采用不同关键词和不同句式骨架，不能只是替换一个名词，也不得仿写已知热门作品名称。`;
}

export function buildConsumerVolumeTitlePolicy(): string {
  return `【卷名要求】
1. 每一卷填写 title 前，在内部构思至少 3 个候选，只输出最能代表本卷独有阶段变化的一个。
2. title 优先为 4—10 个汉字，不加“第几卷”，不写成目标说明或剧情摘要。
3. 优先取自本卷最有辨识度的地点、物件、关系变化、制度冲突或转折结果，让卷名与其他卷不可互换。
4. 禁止使用“${genericTitleText}”以及“成长、蜕变、启程、决战”等缺少本书具体信息的单独概括。
5. 相邻卷不得重复同一核心词、同一尾词或同一句式；卷名不能提前泄露本卷结局。`;
}

export function buildConsumerChapterTitlePolicy(recentTitles: string[] = []): string {
  const recentTitleInstruction = recentTitles.length > 0
    ? `最近章节标题为：${recentTitles.map((title) => `《${title}》`).join("、")}。新标题不得与它们重复核心词或句式。`
    : "这是开篇章节，没有历史标题可参考，但仍不得使用通用占位标题。";

  return `【章节标题要求】
1. 填写 title 前，先在内部构思至少 3 个候选，只输出最准确、最有记忆点的一个，不输出候选或解释。
2. title 优先为 4—12 个汉字，最长不超过 16 个字符；不写“第 N 章”，不加书名号、冒号式说明或句末标点。
3. 标题必须取自本章真正发生且最有辨识度的动作、物件、地点、冲突、决定或短对白，不能只是概括“剧情有了进展”。
4. 禁止使用“${genericTitleText}”一类抽象万能标题，也禁止“某某的决定、某某的计划、某某的发现”等流水账结构。
5. 不提前泄露章末答案、幕后身份或尚未被正文确认的真相；标题应在读完本章后显得准确，而不是靠剧透制造吸引力。
6. ${recentTitleInstruction}`;
}
