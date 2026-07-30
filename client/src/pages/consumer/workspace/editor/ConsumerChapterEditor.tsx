import type { ChangeEvent, SyntheticEvent } from "react";
import { Button } from "@/components/ui/button";
import type { ConsumerChapterProductionSnapshot } from "@0xnovelagent/shared/types/consumerChapterProduction";
import type {
  ConsumerChapterCandidate,
  ConsumerChapterWorkspace,
} from "@0xnovelagent/shared/types/consumerWorkspace";
import ConsumerVersionHistoryPanel from "../ConsumerVersionHistoryPanel";

interface ConsumerChapterEditorProps {
  chapterTitle: string;
  content: string;
  candidate: ConsumerChapterCandidate | null;
  candidatePreview: ConsumerChapterCandidate | null;
  revisionPanelOpen: boolean;
  revisionActive: boolean;
  productionStatus: ConsumerChapterProductionSnapshot["status"] | null;
  readOnly: boolean;
  historyOpen: boolean;
  versions: ConsumerChapterWorkspace["versions"];
  restoringVersionId: string;
  onToggleCandidatePreview: () => void;
  onContentChange: (content: string) => void;
  onSelectionChange: (start: number | null, end: number | null) => void;
  onBlur: () => void;
  onRestoreVersion: (versionId: string) => void;
}

export default function ConsumerChapterEditor({
  chapterTitle,
  content,
  candidate,
  candidatePreview,
  revisionPanelOpen,
  revisionActive,
  productionStatus,
  readOnly,
  historyOpen,
  versions,
  restoringVersionId,
  onToggleCandidatePreview,
  onContentChange,
  onSelectionChange,
  onBlur,
  onRestoreVersion,
}: ConsumerChapterEditorProps) {
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onContentChange(event.target.value);
  };
  const handleSelect = (event: SyntheticEvent<HTMLTextAreaElement>) => {
    onSelectionChange(
      event.currentTarget.selectionStart,
      event.currentTarget.selectionEnd,
    );
  };
  const generating = productionStatus === "created" || productionStatus === "running";

  return (
    <div className="flex min-h-[58dvh] min-w-0 shrink-0 lg:min-h-0 lg:flex-1 lg:shrink">
      <div className="min-w-0 flex-1 overflow-y-auto">
        {candidate && revisionPanelOpen ? (
          <div className="flex min-h-11 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs text-slate-700 sm:px-6 md:px-10">
            <span>
              {candidatePreview
                ? "正在查看修改建议，原正文没有改变。"
                : "正在查看原正文。"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={onToggleCandidatePreview}
            >
              {candidatePreview ? "查看原文" : "查看修改稿"}
            </Button>
          </div>
        ) : null}

        <div className="mx-auto min-h-full max-w-3xl px-5 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
          <textarea
            aria-label={`${chapterTitle}${candidatePreview ? "修改建议" : "正文"}`}
            value={candidatePreview?.content ?? content}
            spellCheck
            readOnly={readOnly}
            className="min-h-[50dvh] w-full resize-none border-0 bg-transparent text-base leading-8 text-slate-950 outline-none placeholder:text-slate-500 read-only:cursor-text read-only:text-slate-800 sm:text-[17px] lg:min-h-[calc(100dvh-13rem)]"
            placeholder={
              generating
                ? "正文生成后会出现在这里……"
                : revisionActive
                  ? "修改建议生成期间，当前正文保持不变。"
                  : "从这里开始写这一章……"
            }
            onChange={handleChange}
            onSelect={handleSelect}
            onBlur={onBlur}
          />
        </div>
      </div>

      {historyOpen ? (
        <ConsumerVersionHistoryPanel
          versions={versions}
          restoringVersionId={restoringVersionId}
          onRestore={onRestoreVersion}
        />
      ) : null}
    </div>
  );
}
