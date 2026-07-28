const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const scanRoots = [
  "client/src",
  "desktop/src",
  "server/src",
  "site",
  ".github",
];
const ignoredDirectoryNames = new Set([
  ".git",
  "build",
  "dist",
  "node_modules",
]);
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);
const blockedReferences = [
  ["explosivecoderflome", ".github.io"].join(""),
  ["ungh", ".cc"].join(""),
  ["github.com", "ExplosiveCoderflome", "AI-Novel-Writing-Assistant"].join("/"),
];

function listTextFiles(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    return textExtensions.has(path.extname(targetPath).toLowerCase()) ? [targetPath] : [];
  }

  const files = [];
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) {
      continue;
    }
    files.push(...listTextFiles(path.join(targetPath, entry.name)));
  }
  return files;
}

const findings = [];
for (const scanRoot of scanRoots) {
  const absoluteRoot = path.join(repoRoot, scanRoot);
  if (!fs.existsSync(absoluteRoot)) {
    continue;
  }
  for (const filePath of listTextFiles(absoluteRoot)) {
    const source = fs.readFileSync(filePath, "utf8").toLowerCase();
    for (const blockedReference of blockedReferences) {
      if (source.includes(blockedReference.toLowerCase())) {
        findings.push({
          file: path.relative(repoRoot, filePath),
          reference: blockedReference,
        });
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Commercial egress audit failed. Legacy public endpoints were found:");
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.reference}`);
  }
  process.exit(1);
}

console.log("Commercial egress audit passed: no legacy public endpoint or third-party star proxy is present.");
