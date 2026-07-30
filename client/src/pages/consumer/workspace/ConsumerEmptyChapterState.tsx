import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ConsumerEmptyChapterStateProps {
  nextOrder: number;
  creating: boolean;
  onCreate: (title: string) => Promise<void>;
}

export default function ConsumerEmptyChapterState({
  nextOrder,
  creating,
  onCreate,
}: ConsumerEmptyChapterStateProps) {
  const [title, setTitle] = useState(`第 ${nextOrder} 章`);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (title.trim()) await onCreate(title.trim());
  };

  return (
    <div className="grid h-full place-items-center px-8">
      <form className="w-full max-w-md text-center" onSubmit={(event) => void submit(event)}>
        <h2 className="text-xl font-semibold text-slate-950">准备第一章</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          先创建一个空白章节。即使暂时无法使用 AI，也可以直接开始写。
        </p>
        <label htmlFor="new-chapter-title" className="sr-only">章节名称</label>
        <Input
          id="new-chapter-title"
          value={title}
          maxLength={120}
          className="mt-6 h-11 border-slate-300 bg-white text-center"
          onChange={(event) => setTitle(event.target.value)}
        />
        <Button type="submit" className="mt-4" disabled={creating || !title.trim()}>
          {creating ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : null}
          {creating ? "正在创建" : "创建章节"}
        </Button>
      </form>
    </div>
  );
}
