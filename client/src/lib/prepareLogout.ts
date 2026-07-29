/**
 * 换账号 / 退出前的「保存当前内容」协调器。
 *
 * 工作台页（ConsumerWorkspacePage）在挂载时注册一个保存草稿的 handler；
 * 会话上下文（ConsumerSessionContext）在真正换账号前调用 runPrepareLogoutHandlers()，
 * 确保用户正在编辑的正文在停服务和重启前已经落盘。
 *
 * 带超时保护：即使某个 handler 卡住（例如保存请求长时间未返回），也不会让换账号永久挂起。
 * 非工作台页面不会注册 handler，runPrepareLogoutHandlers() 会立即 resolve，不影响普通换账号。
 */

type PrepareLogoutHandler = () => void | Promise<void>;

const handlers = new Set<PrepareLogoutHandler>();

const PREPARE_LOGOUT_TIMEOUT_MS = 4000;

export function registerPrepareLogoutHandler(handler: PrepareLogoutHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export async function runPrepareLogoutHandlers(): Promise<void> {
  const current = Array.from(handlers);
  if (current.length === 0) {
    return;
  }
  // 每个 handler 独立超时；某个保存失败不应阻断其他保存和后续换账号。
  await Promise.allSettled(
    current.map(async (handler) => {
      try {
        await withTimeout(Promise.resolve(handler()), PREPARE_LOGOUT_TIMEOUT_MS);
      } catch {
        // best-effort：失败也继续，换账号流程不应被单次保存失败卡住。
      }
    }),
  );
}

function withTimeout(promise: Promise<unknown>, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`prepare-logout handler timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}
