import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getConsumerChapterProduction,
  getLatestConsumerChapterProduction,
  getNextChapterEstimate,
  listConsumerCreationProgress,
  resumeConsumerChapter,
  startNextConsumerChapter,
} from "@/api/consumerChapterProduction";
import {
  resolveConsumerChapterCandidate,
  createConsumerChapter,
  downloadConsumerNovel,
  getConsumerChapterWorkspace,
  getConsumerNovelWorkspace,
  restoreConsumerChapterVersion,
  saveConsumerChapterDraft,
} from "@/api/consumerWorkspace";
import { Button } from "@/components/ui/button";
import { subscribeDesktopBeforeContentClose } from "@/lib/desktop";
import { registerPrepareLogoutHandler } from "@/lib/prepareLogout";
import type { ConsumerChapterProductionSnapshot } from "@0xnovelagent/shared/types/consumerChapterProduction";
import type { ConsumerChapterCandidate, ConsumerChapterWorkspace, ConsumerNovelWorkspace } from "@0xnovelagent/shared/types/consumerWorkspace";
import type { ConsumerChapterRevisionMode } from "@0xnovelagent/shared/types/consumerChapterRevision";
import type { ConsumerCreditEstimate } from "@0xnovelagent/shared/types/consumerSetup";
import ConsumerProductionPanel from "./workspace/ConsumerProductionPanel";
import ConsumerPlanningDialog from "./workspace/ConsumerPlanningDialog";
import ConsumerEmptyChapterState from "./workspace/ConsumerEmptyChapterState";
import ConsumerRevisionPanel from "./workspace/ConsumerRevisionPanel";
import ConsumerStoryReviewPanel from "./workspace/ConsumerStoryReviewPanel";
import ConsumerVersionHistoryPanel from "./workspace/ConsumerVersionHistoryPanel";
import ConsumerWorkspaceDialogs from "./workspace/ConsumerWorkspaceDialogs";
import ConsumerWorkspaceHeader from "./workspace/ConsumerWorkspaceHeader";
import ConsumerWorkspaceSidebar from "./workspace/ConsumerWorkspaceSidebar";
import ConsumerWorkspaceErrorBanner from "./workspace/ConsumerWorkspaceErrorBanner";
import { ConsumerWorkspaceErrorState, ConsumerWorkspaceLoadingState } from "./workspace/ConsumerWorkspaceGateStates";
import { useConsumerChapterRevision } from "./workspace/useConsumerChapterRevision";
import { useConsumerStoryReview } from "./workspace/useConsumerStoryReview";

type SaveState = "saved" | "waiting" | "saving" | "error";

export default function ConsumerWorkspacePage() {
  const { id = "", chapterId = "" } = useParams();
  const navigate = useNavigate();
  const [novelWorkspace, setNovelWorkspace] = useState<ConsumerNovelWorkspace | null>(null);
  const [chapterWorkspace, setChapterWorkspace] = useState<ConsumerChapterWorkspace | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [creatingChapter, setCreatingChapter] = useState(false);
  const [productionBusy, setProductionBusy] = useState(false);
  const [production, setProduction] = useState<ConsumerChapterProductionSnapshot | null>(null);
  const [productionEstimate, setProductionEstimate] = useState<ConsumerCreditEstimate | null>(null);
  const [progress, setProgress] = useState<ConsumerChapterProductionSnapshot[]>([]);
  const [restoringVersionId, setRestoringVersionId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mobileDirectoryOpen, setMobileDirectoryOpen] = useState(false);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [revisionPanelOpen, setRevisionPanelOpen] = useState(false);
  const [storyPanelOpen, setStoryPanelOpen] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [revisionMode, setRevisionMode] = useState<ConsumerChapterRevisionMode>("revise");
  const [activeCandidateId, setActiveCandidateId] = useState("");
  const [previewOriginal, setPreviewOriginal] = useState(false);
  const [candidateBusy, setCandidateBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const revisionRef = useRef(0);
  const contentRef = useRef("");
  const lastSavedContentRef = useRef("");
  const cursorRef = useRef<{ start: number | null; end: number | null }>({
    start: null,
    end: null,
  });
  const saveInFlightRef = useRef<Promise<number> | null>(null);

  const loadNovel = useCallback(async () => {
    if (!id) return;
    const data = await getConsumerNovelWorkspace(id);
    setNovelWorkspace(data);
    if (!chapterId && data.chapters[0]) {
      navigate(
        `/novels/${encodeURIComponent(id)}/chapters/${encodeURIComponent(data.chapters[0].id)}`,
        { replace: true },
      );
    }
  }, [chapterId, id, navigate]);

  const loadChapter = useCallback(async () => {
    if (!id || !chapterId) {
      setChapterWorkspace(null);
      return;
    }
    const data = await getConsumerChapterWorkspace(id, chapterId);
    setChapterWorkspace(data);
    setContent(data.draft.content);
    contentRef.current = data.draft.content;
    lastSavedContentRef.current = data.draft.content;
    revisionRef.current = data.draft.revision;
    cursorRef.current = {
      start: data.draft.cursorStart,
      end: data.draft.cursorEnd,
    };
    setSaveState("saved");
  }, [chapterId, id]);

  const loadProduction = useCallback(async () => {
    if (!id || !chapterId) {
      setProduction(null);
      setProgress([]);
      return;
    }
    const [latest, estimate, recentProgress] = await Promise.all([
      getLatestConsumerChapterProduction(id, chapterId),
      getNextChapterEstimate(),
      listConsumerCreationProgress(id),
    ]);
    setProduction(latest);
    setProductionEstimate(estimate);
    setProgress(recentProgress);
  }, [chapterId, id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void Promise.all([loadNovel(), loadChapter(), loadProduction()])
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "暂时无法打开作品。");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadChapter, loadNovel, loadProduction]);

  useEffect(() => {
    if (
      !id
      || !production
      || !["created", "running"].includes(production.status)
    ) {
      return;
    }
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const next = await getConsumerChapterProduction(id, production.operationId);
        setProduction(next);
        await loadChapter();
        if (!["created", "running"].includes(next.status)) {
          await Promise.all([loadNovel(), loadProduction()]);
        }
      } catch (pollError) {
        setError(pollError instanceof Error ? pollError.message : "暂时无法刷新生成进度。");
      } finally {
        polling = false;
      }
    };
    const timer = window.setInterval(() => void poll(), 1_000);
    return () => window.clearInterval(timer);
  }, [id, loadChapter, loadNovel, loadProduction, production]);

  const persistDraft = useCallback(async (): Promise<number> => {
    if (!id || !chapterId) {
      return revisionRef.current;
    }
    while (saveInFlightRef.current) {
      await saveInFlightRef.current;
    }
    const nextContent = contentRef.current;
    if (nextContent === lastSavedContentRef.current) {
      setSaveState("saved");
      return revisionRef.current;
    }
    setSaveState("saving");
    const savePromise = (async () => {
      const draft = await saveConsumerChapterDraft(id, chapterId, {
        content: nextContent,
        expectedRevision: revisionRef.current,
        cursorStart: cursorRef.current.start,
        cursorEnd: cursorRef.current.end,
      });
      revisionRef.current = draft.revision;
      lastSavedContentRef.current = nextContent;
      setChapterWorkspace((current) => current ? { ...current, draft } : current);
      setSaveState(contentRef.current === nextContent ? "saved" : "waiting");
      setError("");
      return draft.revision;
    })();
    saveInFlightRef.current = savePromise;
    try {
      return await savePromise;
    } catch (saveError) {
      setSaveState("error");
      setError(
        saveError instanceof Error
          ? saveError.message
          : "内容暂时没有保存，请不要关闭软件并重试。",
      );
      throw saveError;
    } finally {
      if (saveInFlightRef.current === savePromise) {
        saveInFlightRef.current = null;
      }
    }
  }, [chapterId, id]);

  const revisionWorkflow = useConsumerChapterRevision({
    novelId: id,
    chapterId,
    persistDraft,
    refreshChapter: loadChapter,
    onError: setError,
  });
  const storyWorkflow = useConsumerStoryReview({
    novelId: id,
    onError: setError,
    onPlanningChanged: loadNovel,
  });

  useEffect(() => {
    const pending = chapterWorkspace?.candidates.filter(
      (candidate) => candidate.status === "pending",
    ) ?? [];
    if (pending.length > 0) {
      if (!pending.some((candidate) => candidate.id === activeCandidateId)) {
        setActiveCandidateId(pending[0].id);
      }
      setPreviewOriginal(false);
      setRevisionPanelOpen(true);
    } else {
      setActiveCandidateId("");
      setPreviewOriginal(false);
    }
    if (
      revisionWorkflow.operation
      && ["created", "running", "failed", "outcome_unknown"].includes(
        revisionWorkflow.operation.status,
      )
    ) {
      setRevisionMode(revisionWorkflow.operation.mode);
      setRevisionPanelOpen(true);
    }
  }, [activeCandidateId, chapterWorkspace, revisionWorkflow.operation]);

  useEffect(() => subscribeDesktopBeforeContentClose(async () => {
    await persistDraft();
  }), [persistDraft]);

  // 换账号前也保存一次草稿：工作台挂载时注册，卸载时注销。
  // 这样 ConsumerSessionContext.logout 在停服务重启前能确保正文已落盘。
  useEffect(() => registerPrepareLogoutHandler(async () => {
    await persistDraft();
  }), [persistDraft]);

  useEffect(() => {
    if (!chapterWorkspace || content === lastSavedContentRef.current) {
      return;
    }
    setSaveState("waiting");
    const timer = window.setTimeout(() => {
      void persistDraft();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [chapterWorkspace, content, persistDraft]);

  const createChapter = async (title: string) => {
    if (!id) return;
    setCreatingChapter(true);
    setError("");
    try {
      await persistDraft().catch(() => undefined);
      const created = await createConsumerChapter(id, { title });
      await loadNovel();
      navigate(
        `/novels/${encodeURIComponent(id)}/chapters/${encodeURIComponent(created.chapter.id)}`,
      );
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "章节没有创建成功。");
    } finally {
      setCreatingChapter(false);
    }
  };

  const continueNextChapter = async () => {
    if (!id || !chapterId) return;
    setProductionBusy(true);
    setError("");
    try {
      const revision = await persistDraft();
      const started = await startNextConsumerChapter(id, chapterId, {
        expectedRevision: revision,
        requestKey: crypto.randomUUID(),
      });
      setProduction(started);
      await loadNovel();
      navigate(
        `/novels/${encodeURIComponent(id)}/chapters/${encodeURIComponent(started.chapterId)}`,
      );
    } catch (productionError) {
      setError(
        productionError instanceof Error
          ? productionError.message
          : "下一章没有开始，请重试。",
      );
      await loadProduction().catch(() => undefined);
    } finally {
      setProductionBusy(false);
    }
  };

  const resumeProduction = async () => {
    if (!id || !chapterId) return;
    setProductionBusy(true);
    setError("");
    try {
      const revision = await persistDraft();
      const started = await resumeConsumerChapter(id, chapterId, {
        expectedRevision: revision,
        requestKey: crypto.randomUUID(),
      });
      setProduction(started);
    } catch (resumeError) {
      setError(
        resumeError instanceof Error
          ? resumeError.message
          : "章节没有继续生成，请重试。",
      );
      await loadProduction().catch(() => undefined);
    } finally {
      setProductionBusy(false);
    }
  };

  const openRevision = (mode: ConsumerChapterRevisionMode) => {
    setRevisionMode(mode);
    setPreviewOriginal(false);
    setRevisionPanelOpen(true);
    setError("");
  };

  const openStoryAdjustment = () => {
    setRevisionPanelOpen(false);
    setStoryPanelOpen(true);
    setError("");
  };

  const runStoryAction = async (action: () => Promise<void>, fallback: string) => {
    setError("");
    try {
      await persistDraft();
      await action();
    } catch (storyError) {
      setError(storyError instanceof Error ? storyError.message : fallback);
      await storyWorkflow.load().catch(() => undefined);
    }
  };

  const startRevision = async (input: {
    mode: ConsumerChapterRevisionMode;
    preset: "natural_language" | "stronger_emotion" | "tighter_pacing" | "custom";
    instruction: string;
    sourceCandidateId?: string;
  }) => {
    setError("");
    try {
      await revisionWorkflow.start(input);
      setRevisionMode(input.mode);
      setRevisionPanelOpen(true);
    } catch (revisionError) {
      setError(
        revisionError instanceof Error
          ? revisionError.message
          : "修改建议没有开始生成，请重试。",
      );
      await revisionWorkflow.load().catch(() => undefined);
    }
  };

  const adoptCandidate = async (candidateId: string) => {
    if (!id || !chapterId) return;
    setCandidateBusy(true);
    setError("");
    try {
      const expectedRevision = await persistDraft();
      const data = await resolveConsumerChapterCandidate(
        id,
        chapterId,
        candidateId,
        { action: "adopt", expectedRevision },
      );
      setChapterWorkspace(data);
      setContent(data.draft.content);
      contentRef.current = data.draft.content;
      lastSavedContentRef.current = data.draft.content;
      revisionRef.current = data.draft.revision;
      setSaveState("saved");
      setActiveCandidateId("");
      setPreviewOriginal(false);
      setRevisionPanelOpen(false);
      await revisionWorkflow.load();
    } catch (candidateError) {
      setError(
        candidateError instanceof Error
          ? candidateError.message
          : "修改建议没有采用成功。",
      );
    } finally {
      setCandidateBusy(false);
    }
  };

  const rejectCandidate = async (candidateId: string) => {
    if (!id || !chapterId) return;
    setCandidateBusy(true);
    setError("");
    try {
      const data = await resolveConsumerChapterCandidate(
        id,
        chapterId,
        candidateId,
        { action: "reject" },
      );
      setChapterWorkspace(data);
      const remaining = data.candidates.filter((candidate) => candidate.status === "pending");
      setActiveCandidateId(remaining[0]?.id ?? "");
      setPreviewOriginal(false);
      if (remaining.length === 0) setRevisionPanelOpen(false);
    } catch (candidateError) {
      setError(
        candidateError instanceof Error
          ? candidateError.message
          : "暂时无法保留原文，请重试。",
      );
    } finally {
      setCandidateBusy(false);
    }
  };

  const restoreVersion = async (versionId: string) => {
    if (!id || !chapterId) return;
    setRestoringVersionId(versionId);
    setError("");
    try {
      await persistDraft();
      const data = await restoreConsumerChapterVersion(id, chapterId, versionId, {
        expectedRevision: revisionRef.current,
      });
      setChapterWorkspace(data);
      setContent(data.draft.content);
      contentRef.current = data.draft.content;
      lastSavedContentRef.current = data.draft.content;
      revisionRef.current = data.draft.revision;
      setSaveState("saved");
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "历史版本没有恢复成功。");
    } finally {
      setRestoringVersionId("");
    }
  };

  const exportNovel = async () => {
    if (!id || !novelWorkspace) return;
    setExporting(true);
    setError("");
    try {
      await persistDraft();
      await downloadConsumerNovel(id, novelWorkspace.novel.title);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "作品没有导出成功。");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <ConsumerWorkspaceLoadingState />;
  }

  if (!novelWorkspace || error && !chapterWorkspace && chapterId) {
    return <ConsumerWorkspaceErrorState message={error || "作品不存在。"} />;
  }

  const nextOrder = novelWorkspace.chapters.length + 1;
  const pendingCandidates: ConsumerChapterCandidate[] = chapterWorkspace?.candidates.filter(
    (candidate) => candidate.status === "pending",
  ) ?? [];
  const activeCandidate = pendingCandidates.find(
    (candidate) => candidate.id === activeCandidateId,
  ) ?? pendingCandidates[0] ?? null;
  const candidatePreview = revisionPanelOpen && !previewOriginal
    ? activeCandidate
    : null;
  const revisionActive = revisionWorkflow.operation?.status === "created"
    || revisionWorkflow.operation?.status === "running";
  const storyActive = storyWorkflow.operation?.status === "created"
    || storyWorkflow.operation?.status === "running";
  const storyPanelVisible = Boolean(storyWorkflow.checkpoint?.required) || storyPanelOpen;
  const editorReadOnly = Boolean(candidatePreview)
    || revisionActive
    || storyActive
    || production?.status === "created"
    || production?.status === "running";

  return (
    <div className="flex h-full min-h-0 bg-white">
      <ConsumerWorkspaceSidebar
        novelTitle={novelWorkspace.novel.title}
        chapters={novelWorkspace.chapters}
        selectedChapterId={chapterId}
        onSelectChapter={(selectedChapterId) => {
          void persistDraft().catch(() => undefined);
          navigate(`/novels/${encodeURIComponent(id)}/chapters/${encodeURIComponent(selectedChapterId)}`);
        }}
        onOpenPlanning={() => setPlanningOpen(true)}
        onAdjustStory={openStoryAdjustment}
      />

      <main className="min-w-0 flex-1">
        {!chapterWorkspace ? (
          <ConsumerEmptyChapterState
            nextOrder={nextOrder}
            creating={creatingChapter}
            onCreate={createChapter}
          />
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <ConsumerWorkspaceHeader
              chapterTitle={chapterWorkspace.chapter.title}
              saveState={saveState}
              directoryOpen={mobileDirectoryOpen}
              onOpenDirectory={() => setMobileDirectoryOpen(true)}
              exporting={exporting}
              onExport={() => void exportNovel()}
              historyOpen={historyOpen}
              onToggleHistory={() => setHistoryOpen((current) => !current)}
              mobileHistoryOpen={mobileHistoryOpen}
              onOpenMobileHistory={() => setMobileHistoryOpen(true)}
            />

            <ConsumerWorkspaceErrorBanner
              message={error}
              saveFailed={saveState === "error"}
              onRetrySave={() => void persistDraft()}
            />

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
              <div className="flex min-h-[58dvh] min-w-0 shrink-0 lg:min-h-0 lg:flex-1 lg:shrink">
                <div className="min-w-0 flex-1 overflow-y-auto">
                  {activeCandidate && revisionPanelOpen ? (
                    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs text-slate-700 sm:px-6 md:px-10">
                      <span>
                        {candidatePreview ? "正在查看修改建议，原正文没有改变。" : "正在查看原正文。"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        onClick={() => setPreviewOriginal((current) => !current)}
                      >
                        {candidatePreview ? "查看原文" : "查看修改稿"}
                      </Button>
                    </div>
                  ) : null}
                  <div className="mx-auto min-h-full max-w-3xl px-5 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
                    <textarea
                      aria-label={`${chapterWorkspace.chapter.title}${candidatePreview ? "修改建议" : "正文"}`}
                      value={candidatePreview?.content ?? content}
                      spellCheck
                      readOnly={editorReadOnly}
                      className="min-h-[50dvh] w-full resize-none border-0 bg-transparent text-base leading-8 text-slate-950 outline-none placeholder:text-slate-500 read-only:cursor-wait read-only:text-slate-800 sm:text-[17px] lg:min-h-[calc(100dvh-13rem)]"
                      placeholder={
                        production?.status === "created" || production?.status === "running"
                          ? "正文生成后会出现在这里……"
                          : revisionActive
                            ? "修改建议生成期间，当前正文保持不变。"
                          : "从这里开始写这一章……"
                      }
                      onChange={(event) => {
                        const nextContent = event.target.value;
                        contentRef.current = nextContent;
                        setContent(nextContent);
                      }}
                      onSelect={(event) => {
                        cursorRef.current = {
                          start: event.currentTarget.selectionStart,
                          end: event.currentTarget.selectionEnd,
                        };
                      }}
                      onBlur={() => void persistDraft()}
                    />
                  </div>
                </div>

                {historyOpen ? (
                  <ConsumerVersionHistoryPanel
                    versions={chapterWorkspace.versions}
                    restoringVersionId={restoringVersionId}
                    onRestore={(versionId) => void restoreVersion(versionId)}
                  />
                ) : null}
              </div>

              {revisionPanelOpen ? (
                <ConsumerRevisionPanel
                  mode={revisionMode}
                  operation={revisionWorkflow.operation}
                  estimate={revisionWorkflow.estimates[revisionMode]}
                  candidates={pendingCandidates}
                  activeCandidateId={activeCandidate?.id ?? ""}
                  busy={revisionWorkflow.busy || candidateBusy}
                  onClose={() => {
                    setRevisionPanelOpen(false);
                    setPreviewOriginal(false);
                  }}
                  onSelectCandidate={(candidateId) => {
                    setActiveCandidateId(candidateId);
                    setPreviewOriginal(false);
                  }}
                  onGenerate={startRevision}
                  onAdopt={adoptCandidate}
                  onReject={rejectCandidate}
                />
              ) : storyPanelVisible ? (
                <ConsumerStoryReviewPanel
                  checkpoint={storyWorkflow.checkpoint}
                  operation={storyWorkflow.operation}
                  reviewEstimate={storyWorkflow.estimates.review}
                  adjustmentEstimate={storyWorkflow.estimates.adjustment}
                  transitionEstimate={storyWorkflow.estimates.transition}
                  busy={storyWorkflow.busy}
                  adjustmentMode={storyPanelOpen}
                  onClose={() => setStoryPanelOpen(false)}
                  onStartCheckpoint={(action) => runStoryAction(
                    () => storyWorkflow.startCheckpoint(action),
                    "故事检查没有开始，请重试。",
                  )}
                  onStartAdjustment={(instruction) => runStoryAction(
                    () => storyWorkflow.startAdjustment(instruction),
                    "调整方案没有开始生成，请重试。",
                  )}
                  onResolve={(action) => runStoryAction(
                    () => storyWorkflow.resolve(action),
                    "故事方案没有处理成功，请重试。",
                  )}
                />
              ) : (
                <ConsumerProductionPanel
                  production={production}
                  estimate={productionEstimate}
                  progress={progress}
                  busy={productionBusy}
                  saveBlocked={saveState === "error"}
                  hasContent={Boolean(content.trim())}
                  onContinueNext={() => void continueNextChapter()}
                  onResume={() => void resumeProduction()}
                  onOpenRevision={openRevision}
                />
              )}
            </div>

            <ConsumerWorkspaceDialogs
              novelTitle={novelWorkspace.novel.title}
              chapters={novelWorkspace.chapters}
              selectedChapterId={chapterId}
              directoryOpen={mobileDirectoryOpen}
              onDirectoryOpenChange={setMobileDirectoryOpen}
              onSelectChapter={(selectedChapterId) => {
                void persistDraft().catch(() => undefined);
                navigate(`/novels/${encodeURIComponent(id)}/chapters/${encodeURIComponent(selectedChapterId)}`);
              }}
              onOpenPlanning={() => setPlanningOpen(true)}
              onAdjustStory={openStoryAdjustment}
              historyOpen={mobileHistoryOpen}
              onHistoryOpenChange={setMobileHistoryOpen}
              versions={chapterWorkspace.versions}
              restoringVersionId={restoringVersionId}
              onRestoreVersion={restoreVersion}
            />
            <ConsumerPlanningDialog
              open={planningOpen}
              onOpenChange={setPlanningOpen}
              planning={storyWorkflow.planning}
              restoring={storyWorkflow.busy}
              onRestore={(versionId) => runStoryAction(
                () => storyWorkflow.restore(versionId),
                "规划版本没有恢复成功。",
              )}
            />
          </div>
        )}
      </main>
    </div>
  );
}
