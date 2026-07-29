import { Database, Lightbulb, BookOpenText } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const plannedItems = [
  {
    title: "灵感示例",
    description: "没有想法时，可以在这里翻看不同题材的开头和故事种子。",
    icon: Lightbulb,
  },
  {
    title: "写作参考资料",
    description: "把你查到的资料、设定、人物素材放进来，写作时随时调用。",
    icon: BookOpenText,
  },
] as const;

export default function ConsumerMaterialsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl pb-12">
      <header className="border-b border-slate-200 pb-8">
        <p className="text-sm font-medium text-slate-600">素材</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
          给你写故事的灵感和资料
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          这里会收集灵感示例和你自己的写作参考资料，帮助你在卡住时找到方向。当前版本还在准备中，你可以先回到创作。
        </p>
      </header>

      <section className="py-10" aria-labelledby="materials-planned-heading">
        <h2 id="materials-planned-heading" className="text-lg font-semibold text-slate-950">
          计划提供
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {plannedItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-5"
              >
                <span className="grid size-9 place-items-center rounded-lg bg-white text-slate-700 ring-1 ring-slate-200">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-3 text-base font-semibold text-slate-950">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">{item.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white px-6 py-8 text-center">
        <Database className="mx-auto size-7 text-slate-400" aria-hidden="true" />
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-600">
          素材功能会在后续版本提供。现在你可以先开始或继续写你的故事。
        </p>
        <Button asChild className="mt-6">
          <Link to="/">回到创作</Link>
        </Button>
      </section>
    </div>
  );
}
