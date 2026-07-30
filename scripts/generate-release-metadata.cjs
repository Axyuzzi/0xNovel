const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const defaultOutputDir = path.join(repoRoot, "desktop", "build", "dist", "release-metadata");
const outputArgumentIndex = process.argv.indexOf("--output");
const outputDir = outputArgumentIndex >= 0 && process.argv[outputArgumentIndex + 1]
  ? path.resolve(repoRoot, process.argv[outputArgumentIndex + 1])
  : defaultOutputDir;

function readPackageMetadata(packagePath, fallbackName, fallbackVersion) {
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(packagePath, "package.json"), "utf8"),
    );
    const license = typeof packageJson.license === "string"
      ? packageJson.license
      : Array.isArray(packageJson.licenses)
        ? packageJson.licenses.map((entry) => entry.type || entry).join(" OR ")
        : "NOASSERTION";
    const repository = typeof packageJson.repository === "string"
      ? packageJson.repository
      : packageJson.repository?.url || null;
    return {
      name: packageJson.name || fallbackName,
      version: packageJson.version || fallbackVersion || "0.0.0",
      license,
      repository,
      homepage: packageJson.homepage || null,
    };
  } catch {
    return {
      name: fallbackName,
      version: fallbackVersion || "0.0.0",
      license: "NOASSERTION",
      repository: null,
      homepage: null,
    };
  }
}

function componentRef(name, version) {
  return `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
}

function main() {
  const listArgs = ["licenses", "list", "--prod", "--json"];
  const command = process.platform === "win32"
    ? process.env.ComSpec || "cmd.exe"
    : "pnpm";
  const commandArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", `pnpm ${listArgs.join(" ")}`]
    : listArgs;
  const raw = execFileSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const licenseGroups = JSON.parse(raw);
  const components = new Map();
  for (const [licenseName, packages] of Object.entries(licenseGroups)) {
    if (!Array.isArray(packages)) {
      continue;
    }
    for (const packageEntry of packages) {
      if (!packageEntry || typeof packageEntry !== "object") {
        continue;
      }
      for (const version of packageEntry.versions || []) {
        const packagePath = (packageEntry.paths || []).find((candidatePath) => {
          const metadata = readPackageMetadata(candidatePath, packageEntry.name, version);
          return metadata.version === version;
        }) || packageEntry.paths?.[0] || "";
        const metadata = readPackageMetadata(packagePath, packageEntry.name, version);
        if (metadata.name.startsWith("@0xnovelagent/")) {
          continue;
        }
        const ref = componentRef(metadata.name, metadata.version);
        const license = packageEntry.license || metadata.license || licenseName || "NOASSERTION";
        components.set(ref, {
          type: "library",
          name: metadata.name,
          version: metadata.version,
          "bom-ref": ref,
          purl: ref,
          licenses: license === "NOASSERTION"
            ? [{ license: { name: "NOASSERTION" } }]
            : [{ expression: license }],
          externalReferences: [
            metadata.homepage || packageEntry.homepage
              ? { type: "website", url: metadata.homepage || packageEntry.homepage }
              : null,
            metadata.repository
              ? { type: "vcs", url: metadata.repository.replace(/^git\+/u, "") }
              : null,
          ].filter(Boolean),
        });
      }
    }
  }

  const sortedComponents = Array.from(components.values())
    .sort((left, right) => left["bom-ref"].localeCompare(right["bom-ref"]));
  const serialSeed = sortedComponents.map((item) => item["bom-ref"]).join("\n");
  const crypto = require("node:crypto");
  const serialHex = crypto.createHash("sha256").update(serialSeed).digest("hex");
  const serial = [
    serialHex.slice(0, 8),
    serialHex.slice(8, 12),
    `4${serialHex.slice(13, 16)}`,
    `8${serialHex.slice(17, 20)}`,
    serialHex.slice(20, 32),
  ].join("-");
  const bom = {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: `urn:uuid:${serial}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: {
        type: "application",
        name: "0xNovelAgent Desktop",
        version: JSON.parse(
          fs.readFileSync(path.join(repoRoot, "desktop", "package.json"), "utf8"),
        ).version,
      },
    },
    components: sortedComponents,
    dependencies: [],
  };
  const licenses = sortedComponents.map((component) => ({
    name: component.name,
    version: component.version,
    license: component.licenses[0]?.expression
      || component.licenses[0]?.license?.name
      || "NOASSERTION",
    repository: component.externalReferences.find((entry) => entry.type === "vcs")?.url || null,
    homepage: component.externalReferences.find((entry) => entry.type === "website")?.url || null,
  }));

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, "bom.cyclonedx.json"),
    `${JSON.stringify(bom, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(outputDir, "third-party-licenses.json"),
    `${JSON.stringify({
      generatedAt: bom.metadata.timestamp,
      notice: "Review NOASSERTION entries and all license obligations before public distribution.",
      packages: licenses,
    }, null, 2)}\n`,
    "utf8",
  );
  console.log(`[release-metadata] wrote ${sortedComponents.length} production components to ${outputDir}`);
}

try {
  main();
} catch (error) {
  console.error("[release-metadata] failed.", error);
  process.exit(1);
}
