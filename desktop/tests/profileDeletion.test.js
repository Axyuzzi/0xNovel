const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  LOCAL_PROFILE_DELETION_CONFIRMATION,
  moveLocalProfileToTrash,
} = require("../dist/runtime/profileDeletion.js");

test("local profile deletion requires typed confirmation and an exact profile child", async () => {
  const appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "0xnovel-profile-delete-"));
  const profileId = "a".repeat(32);
  const profileDir = path.join(appDataDir, "profiles", profileId);
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(path.join(profileDir, "dev.db"), "local data");
  const trashed = [];

  await assert.rejects(
    moveLocalProfileToTrash({
      appDataDir,
      profileDir,
      confirmation: "删除",
      trashItem: async (targetPath) => trashed.push(targetPath),
    }),
    /请输入/,
  );
  await assert.rejects(
    moveLocalProfileToTrash({
      appDataDir,
      profileDir: appDataDir,
      confirmation: LOCAL_PROFILE_DELETION_CONFIRMATION,
      trashItem: async (targetPath) => trashed.push(targetPath),
    }),
    /拒绝删除/,
  );

  const result = await moveLocalProfileToTrash({
    appDataDir,
    profileDir,
    confirmation: LOCAL_PROFILE_DELETION_CONFIRMATION,
    trashItem: async (targetPath) => trashed.push(targetPath),
  });
  assert.equal(result.deleted, true);
  assert.deepEqual(trashed, [profileDir]);
});
