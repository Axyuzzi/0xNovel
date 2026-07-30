import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, LoaderCircle, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { listConsumerNovels } from "@/api/consumerWorkspace";
import { Button } from "@/components/ui/button";
import type { ConsumerNovelSummary } from "@0xnovelagent/shared/types/consumerWorkspace";

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ConsumerNovelListPage() {
  const [novels, setNovels] = useState<ConsumerNovelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void listConsumerNovels()
      .then((items) => {
        if (!cancelled) setNovels(items);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "暂时无法读取本地作品。");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl pb-12">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-slate-200 pb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-950">我的作品</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            作品保存在这台电脑。选择一本继续写，或者开始一个新故事。
          </p>
        </div>
        <Button asChild>
          <Link to="/novels/create">
            <Plus className="size-4" />
            创建新作品
          </Link>
        </Button>
      </header>

      {loading ? (
        <div className="flex items-center gap-3 py-12 text-sm text-slate-600" role="status">
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
          正在读取本地作品
        </div>
      ) : error ? (
        <div className="py-12">
          <p role="alert" className="text-sm text-red-800">{error}</p>
          <Button variant="outline" className="mt-5" onClick={() => window.location.reload()}>
            重新读取
          </Button>
        </div>
      ) : novels.length === 0 ? (
        <section className="py-16 text-center" aria-labelledby="empty-novels-heading">
          <BookOpen className="mx-auto size-8 text-slate-500" aria-hidden="true" />
          <h2 id="empty-novels-heading" className="mt-5 text-xl font-semibold text-slate-950">
            从一个想法开始
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
            不需要先准备大纲。写下一句你想讲的故事，我们会陪你逐步完成。
          </p>
          <Button asChild className="mt-7">
            <Link to="/novels/create">创建我的第一本作品</Link>
          </Button>
        </section>
      ) : (
        <div className="divide-y divide-slate-200 border-b border-slate-200">
          {novels.map((novel) => (
            <Link
              key={novel.id}
              to={`/novels/${encodeURIComponent(novel.id)}/edit`}
              className="group flex items-center gap-5 py-5 outline-none transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700">
                <BookOpen className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-slate-950">
                  {novel.title}
                </span>
                <span className="mt-1 block text-sm text-slate-600">
                  {novel.chapterCount > 0 ? `${novel.chapterCount} 章` : "还没有章节"}
                  <span aria-hidden="true"> · </span>
                  {formatUpdatedAt(novel.updatedAt)} 编辑
                </span>
              </span>
              <ArrowRight
                className="mr-2 size-4 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
