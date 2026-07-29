import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  LoaderCircle,
  PenLine,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createConsumerNovel, listConsumerNovels } from "@/api/consumerWorkspace";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function formatUpdatedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
  } catch {
    return "";
  }
}

export default function ConsumerHomePage() {
  const navigate = useNavigate();
  const novelsQuery = useQuery({
    queryKey: queryKeys.novels.all,
    queryFn: listConsumerNovels,
  });

  const sortedNovels = useMemo(() => {
    const novels = novelsQuery.data ?? [];
    return [...novels].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [novelsQuery.data]);

  // 无作品：视觉中心是“你想写一个什么故事？”，一句话输入直接进入准备流程。
  if (!novelsQuery.isLoading && sortedNovels.length === 0) {
    return <EmptyHomeIdeaInput navigate={navigate} />;
  }

  const primary = sortedNovels[0];
  const setupIncomplete = primary ? primary.chapterCount === 0 : false;

  return (
    <div className="mx-auto w-full max-w-4xl pb-12">
      <header className="border-b border-slate-200 pb-8">
        <p className="text-sm font-medium text-slate-600">首页</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
          继续你的创作
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          从上次写到的地方接着写，或者开始一个新故事。
        </p>
      </header>

      {novelsQuery.isLoading ? (
        <div className="py-16 text-center text-sm text-slate-500">正在读取你的作品…</div>
      ) : novelsQuery.isError ? (
        <div className="py-16 text-center">
          <p className="text-sm text-slate-600">暂时无法读取作品，请稍后重试。</p>
          <Button variant="outline" className="mt-4" onClick={() => void novelsQuery.refetch()}>
            重新读取
          </Button>
        </div>
      ) : primary ? (
        <>
          {/* 主动作卡：最近作品。准备未完成（chapterCount===0）时引导回准备流程，而不是进编辑器。 */}
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
                <BookOpen className="size-6" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {setupIncomplete ? "继续完成作品准备" : "继续写作"}
                </p>
                <h2 className="mt-1 truncate text-xl font-semibold text-slate-950">
                  {primary.title}
                </h2>
                <p className="mt-1.5 text-sm text-slate-600">
                  {setupIncomplete
                    ? "故事方向还没确认完，先把作品准备好再开始写正文。"
                    : `${primary.chapterCount} 章 · 上次更新 ${formatUpdatedAt(primary.updatedAt)}`}
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to={setupIncomplete
                  ? `/novels/${encodeURIComponent(primary.id)}/setup`
                  : `/novels/${encodeURIComponent(primary.id)}/edit`}>
                  {setupIncomplete ? "继续完成作品准备" : "继续写作"}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/novels/create">
                  <PenLine className="size-4" />
                  开始新故事
                </Link>
              </Button>
            </div>
          </section>

          {/* 其余最近作品：紧凑列表，最多 3 本。 */}
          {sortedNovels.length > 1 ? (
            <section className="mt-8" aria-labelledby="recent-novels-heading">
              <h3 id="recent-novels-heading" className="text-sm font-semibold text-slate-900">
                最近的作品
              </h3>
              <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
                {sortedNovels.slice(1, 4).map((novel) => {
                  const incomplete = novel.chapterCount === 0;
                  return (
                    <Link
                      key={novel.id}
                      to={incomplete
                        ? `/novels/${encodeURIComponent(novel.id)}/setup`
                        : `/novels/${encodeURIComponent(novel.id)}/edit`}
                      className="group flex items-center gap-4 py-4 outline-none transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-medium text-slate-950">
                          {novel.title}
                        </span>
                        <span className="mt-0.5 block text-sm text-slate-600">
                          {incomplete ? "作品准备未完成" : `${novel.chapterCount} 章`}
                          {" · "}
                          {formatUpdatedAt(novel.updatedAt)}
                        </span>
                      </span>
                      <ChevronRight className="size-5 shrink-0 text-slate-400 transition group-hover:text-slate-700" aria-hidden="true" />
                    </Link>
                  );
                })}
              </div>
              {sortedNovels.length > 4 ? (
                <Button asChild variant="ghost" className="mt-4">
                  <Link to="/novels">查看全部作品</Link>
                </Button>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** 无作品状态：一句话想法输入，提交后直接进入作品准备流程。复用 ConsumerNovelCreatePage 的文案和 API。 */
function EmptyHomeIdeaInput({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedIdea = idea.trim();
    if (!normalizedIdea) {
      setError("先写下一句你想讲的故事。");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const novel = await createConsumerNovel({
        title: title.trim() || "我的新故事",
        description: normalizedIdea,
      });
      navigate(`/novels/${encodeURIComponent(novel.id)}/setup`, { replace: true });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "作品没有创建成功，请重试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center px-1 pb-16 pt-12 sm:pt-20">
      <div className="w-full text-center">
        <h1 className="text-3xl font-semibold tracking-[-0.025em] text-slate-950 sm:text-4xl">
          你想写一个什么故事？
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-600">
          一句话就够了。作品会先保存在本机，后续再由你逐步确认故事方向。
        </p>
      </div>

      <form className="mt-10 w-full" onSubmit={(event) => void submit(event)}>
        <label htmlFor="story-idea" className="text-sm font-semibold text-slate-900">
          故事想法
        </label>
        <textarea
          id="story-idea"
          value={idea}
          autoFocus
          maxLength={2000}
          rows={6}
          placeholder="例如：一个能看见别人最后一天记忆的普通人，决定阻止一场还没有发生的事故。"
          className="mt-3 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-4 text-base leading-7 text-slate-950 outline-none placeholder:text-slate-500 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15"
          onChange={(event) => setIdea(event.target.value)}
        />
        <div className="mt-5">
          <label htmlFor="story-title" className="text-sm font-semibold text-slate-900">
            暂定书名
            <span className="ml-2 font-normal text-slate-600">可以稍后修改</span>
          </label>
          <Input
            id="story-title"
            value={title}
            maxLength={120}
            placeholder="我的新故事"
            className="mt-3 h-11 border-slate-300 bg-white"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        {error ? (
          <p role="alert" className="mt-5 text-sm text-red-800">{error}</p>
        ) : null}

        <div className="mt-8 flex justify-center">
          <Button type="submit" size="lg" disabled={submitting || !idea.trim()}>
            {submitting ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : null}
            {submitting ? "正在创建" : "帮我完善这个故事"}
          </Button>
        </div>
      </form>
    </div>
  );
}
