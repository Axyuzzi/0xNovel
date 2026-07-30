import fs from "node:fs";
import path from "node:path";

export const LOCAL_PROFILE_DELETION_CONFIRMATION = "删除本机作品";

export interface LocalProfileDeletionResult {
  deleted: boolean;
  targetPath: string;
}

export async function moveLocalProfileToTrash(input: {
  appDataDir: string;
  profileDir: string;
  confirmation: string;
  trashItem: (targetPath: string) => Promise<void>;
}): Promise<LocalProfileDeletionResult> {
  if (input.confirmation !== LOCAL_PROFILE_DELETION_CONFIRMATION) {
    throw new Error(`请输入“${LOCAL_PROFILE_DELETION_CONFIRMATION}”后再继续。`);
  }

  const profilesRoot = path.resolve(input.appDataDir, "profiles");
  const targetPath = path.resolve(input.profileDir);
  const relativePath = path.relative(profilesRoot, targetPath);
  const targetName = path.basename(targetPath);
  const isDirectProfileChild =
    relativePath === targetName
    && !path.isAbsolute(relativePath)
    && !relativePath.startsWith("..")
    && /^[a-f0-9]{32}$/.test(targetName);
  if (!isDirectProfileChild) {
    throw new Error("拒绝删除不属于当前账号的本地资料目录。");
  }

  if (!fs.existsSync(targetPath)) {
    return { deleted: false, targetPath };
  }

  await input.trashItem(targetPath);
  return { deleted: true, targetPath };
}
