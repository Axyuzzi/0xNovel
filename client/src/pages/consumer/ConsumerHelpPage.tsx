import {
  BookOpenText,
  CheckCircle2,
  CloudOff,
  Coins,
  Lightbulb,
  PenLine,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const steps = [
  {
    title: "说出一个故事想法",
    description: "一句话就够。系统会先给你三个不同方向，不要求你会写大纲。",
    icon: Lightbulb,
  },
  {
    title: "逐步确认作品准备",
    description: "故事方向、全书骨架、全部卷、当前剧情和第一章会分开确认，每次 AI 调用前都停下来等你决定。",
    icon: CheckCircle2,
  },
  {
    title: "在正文里继续写",
    description: "正文始终可以直接编辑。AI 修改会先形成候选稿，只有你采用后才替换当前文字。",
    icon: PenLine,
  },
  {
    title: "一章一章推进",
    description: "确认本章后再生成下一章。到剧情阶段或一卷结束时，你可以检查，也可以直接继续。",
    icon: BookOpenText,
  },
] as const;

export default function ConsumerHelpPage() {
  return (
    <div className="mx-auto w-full max-w-4xl pb-12">
      <header className="border-b border-slate-200 pb-8">
        <p className="text-sm font-medium text-slate-600">使用帮助</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
          从一个想法开始写第一本小说
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          你只需要提供想法、选择喜欢的方向，并确认每一章是否满意。模型选择、写作方法和后台流程都由系统自动处理。
        </p>
        <Button asChild className="mt-6 h-11">
          <Link to="/novels/create">开始一本新小说</Link>
        </Button>
      </header>

      <section className="grid gap-4 py-8 sm:grid-cols-2" aria-label="创作步骤">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <article key={step.title} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-slate-100 text-slate-800">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="text-xs font-semibold text-slate-500">第 {index + 1} 步</span>
              </div>
              <h2 className="mt-4 font-semibold text-slate-950">{step.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 border-t border-slate-200 pt-8 md:grid-cols-2">
        <div className="rounded-xl bg-amber-50 p-5 text-amber-950">
          <div className="flex items-center gap-2 font-semibold">
            <Coins className="size-5" aria-hidden="true" />
            哪些操作会扣积分
          </div>
          <p className="mt-2 text-sm leading-6 text-amber-900/80">
            只要发起真实 AI 调用就会按中转实际用量扣费。保存、采用候选稿、恢复版本和直接编辑正文不调用 AI。
          </p>
        </div>
        <div className="rounded-xl bg-sky-50 p-5 text-sky-950">
          <div className="flex items-center gap-2 font-semibold">
            <CloudOff className="size-5" aria-hidden="true" />
            断网时会发生什么
          </div>
          <p className="mt-2 text-sm leading-6 text-sky-900/80">
            本地作品仍能打开和编辑，软件会暂停 AI 与充值操作。联网后回到原位置继续，不会自动重复提交付费请求。
          </p>
        </div>
      </section>

      <p className="mt-8 text-sm text-slate-600">
        想了解作品保存位置、备份和删除方式，可查看
        <Link className="ml-1 font-medium text-slate-950 underline underline-offset-4" to="/privacy">
          隐私与本地数据说明
        </Link>
        。
      </p>
    </div>
  );
}
