import { useState } from "react";
import {
  AlertTriangle,
  Archive,
  Download,
  FolderOpen,
  LoaderCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createDesktopProfileBackup,
  deleteDesktopLocalProfile,
  exportDesktopProfileBackup,
  openDesktopProfileBackupsDirectory,
  restoreDesktopProfileBackup,
} from "@/lib/desktop";

type BackupAction = "create" | "export" | "restore" | "open" | "delete" | null;

const LOCAL_PROFILE_DELETION_CONFIRMATION = "删除本机作品";

export function LocalDataSection() {
  const [activeAction, setActiveAction] = useState<BackupAction>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const runAction = async (
    action: Exclude<BackupAction, null>,
    operation: () => Promise<string | null>,
  ) => {
    setActiveAction(action);
    setMessage("");
    setError("");
    try {
      const result = await operation();
      if (result) {
        setMessage(result);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "操作没有完成，请稍后重试。");
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <section className="mt-10 border-t border-slate-200 pt-8" aria-labelledby="local-data-heading">
      <div className="max-w-2xl">
        <h2 id="local-data-heading" className="text-lg font-semibold text-slate-950">
          本地作品与备份
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          作品只保存在这台电脑。定期创建备份，换电脑或重装系统时可以恢复。
        </p>
      </div>

      {message ? (
        <p role="status" className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Button
          variant="outline"
          className="h-auto justify-start gap-3 px-4 py-4 text-left"
          disabled={activeAction !== null}
          onClick={() => void runAction("create", async () => {
            const result = await createDesktopProfileBackup();
            return result.canceled ? null : "本地安全备份已创建。";
          })}
        >
          {activeAction === "create"
            ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            : <Archive className="size-4" />}
          <span>
            <span className="block font-medium">创建安全备份</span>
            <span className="mt-1 block text-xs font-normal text-slate-600">保存在本机备份文件夹</span>
          </span>
        </Button>

        <Button
          variant="outline"
          className="h-auto justify-start gap-3 px-4 py-4 text-left"
          disabled={activeAction !== null}
          onClick={() => void runAction("export", async () => {
            const result = await exportDesktopProfileBackup();
            return result.canceled ? null : "作品备份已导出到你选择的位置。";
          })}
        >
          {activeAction === "export"
            ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            : <Download className="size-4" />}
          <span>
            <span className="block font-medium">导出备份</span>
            <span className="mt-1 block text-xs font-normal text-slate-600">保存到移动硬盘或其他位置</span>
          </span>
        </Button>

        <Button
          variant="outline"
          className="h-auto justify-start gap-3 px-4 py-4 text-left"
          disabled={activeAction !== null}
          onClick={() => void runAction("restore", async () => {
            const restored = await restoreDesktopProfileBackup();
            return restored ? "正在重新打开恢复后的作品。" : null;
          })}
        >
          {activeAction === "restore"
            ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            : <RotateCcw className="size-4" />}
          <span>
            <span className="block font-medium">从备份恢复</span>
            <span className="mt-1 block text-xs font-normal text-slate-600">只接受当前账号创建的备份</span>
          </span>
        </Button>

        <Button
          variant="ghost"
          className="h-auto justify-start gap-3 px-4 py-4 text-left"
          disabled={activeAction !== null}
          onClick={() => void runAction("open", async () => {
            await openDesktopProfileBackupsDirectory();
            return null;
          })}
        >
          {activeAction === "open"
            ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            : <FolderOpen className="size-4" />}
          <span>
            <span className="block font-medium">打开备份文件夹</span>
            <span className="mt-1 block text-xs font-normal text-slate-600">查看已经创建的备份</span>
          </span>
        </Button>
      </div>

      <div className="mt-8 rounded-xl border border-red-200 bg-red-50/70 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-700" aria-hidden="true" />
          <div>
            <h3 className="font-semibold text-red-950">删除这台电脑上的作品</h3>
            <p className="mt-2 text-sm leading-6 text-red-900/80">
              只删除当前账号在本机的作品、草稿、版本和备份，不注销账号，也不删除积分与中转消费记录。
              删除后资料会进入系统回收站。
            </p>
          </div>
        </div>
        <label htmlFor="local-profile-delete-confirmation" className="mt-5 block text-sm font-medium text-red-950">
          输入“{LOCAL_PROFILE_DELETION_CONFIRMATION}”确认
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <Input
            id="local-profile-delete-confirmation"
            value={deleteConfirmation}
            className="h-11 border-red-300 bg-white"
            autoComplete="off"
            onChange={(event) => setDeleteConfirmation(event.target.value)}
          />
          <Button
            variant="destructive"
            className="h-11 shrink-0"
            disabled={
              activeAction !== null
              || deleteConfirmation !== LOCAL_PROFILE_DELETION_CONFIRMATION
            }
            onClick={() => void runAction("delete", async () => {
              const result = await deleteDesktopLocalProfile(deleteConfirmation);
              if (!result.canceled) {
                setDeleteConfirmation("");
              }
              return result.canceled ? null : "正在退出登录并重新打开软件。";
            })}
          >
            {activeAction === "delete"
              ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
              : <Trash2 className="size-4" />}
            删除本机作品
          </Button>
        </div>
      </div>
    </section>
  );
}
