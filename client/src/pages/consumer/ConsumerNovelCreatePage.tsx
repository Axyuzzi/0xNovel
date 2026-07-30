import { useState, type FormEvent } from "react";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createConsumerNovel } from "@/api/consumerWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ConsumerNovelCreatePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const createNovel = async (event: FormEvent) => {
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
    <div className="mx-auto w-full max-w-3xl pb-12">
      <Link
        to="/novels"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 outline-none hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-900"
      >
        <ArrowLeft className="size-4" />
        返回我的作品
      </Link>

      <header className="mt-10">
        <h1 className="text-3xl font-semibold tracking-[-0.025em] text-slate-950">
          你想写一个什么故事？
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
          一句话就够了。作品会先保存在本机，后续再由你逐步确认故事方向。
        </p>
      </header>

      <form className="mt-10" onSubmit={(event) => void createNovel(event)}>
        <label htmlFor="story-idea" className="text-sm font-semibold text-slate-900">
          故事想法
        </label>
        <textarea
          id="story-idea"
          value={idea}
          autoFocus
          maxLength={2000}
          rows={7}
          placeholder="例如：一个能看见别人最后一天记忆的普通人，决定阻止一场还没有发生的事故。"
          className="mt-3 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-4 text-base leading-7 text-slate-950 outline-none placeholder:text-slate-500 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15"
          onChange={(event) => setIdea(event.target.value)}
        />
        <div className="mt-7">
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

        <div className="mt-8 flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
          <Button asChild variant="ghost">
            <Link to="/novels">取消</Link>
          </Button>
          <Button type="submit" disabled={submitting || !idea.trim()}>
            {submitting ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : null}
            {submitting ? "正在创建" : "创建并选择故事方向"}
          </Button>
        </div>
      </form>
    </div>
  );
}
