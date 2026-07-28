const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const manifestPath = path.join(repoRoot, "site", "src", "docsManifest.ts");
const outputPath = path.join(repoRoot, "site", "public", "sitemap.xml");
const robotsOutputPath = path.join(repoRoot, "site", "public", "robots.txt");
const notFoundOutputPath = path.join(repoRoot, "site", "public", "404.html");

function resolveSiteBase() {
  const configuredUrl = process.env.OXNOVEL_PUBLIC_SITE_URL?.trim();
  if (!configuredUrl) {
    return "";
  }
  const url = new URL(configuredUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("OXNOVEL_PUBLIC_SITE_URL must use http or https.");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/?$/, "/");
}

function extractDocIds(manifestSource) {
  const ids = [];
  const docCallPattern = /\bdoc\(\s*"([^"]+)"/g;
  let match;
  while ((match = docCallPattern.exec(manifestSource)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

function buildNotFoundPage(siteBase) {
  const basePath = siteBase ? new URL(siteBase).pathname.replace(/\/$/, "") : "";
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="robots" content="noindex" />
    <title>正在打开文档...</title>
    <script>
      (function () {
        var base = ${JSON.stringify(basePath)};
        var location = window.location;
        var path = location.pathname;
        if (base && path.indexOf(base) === 0) {
          path = path.slice(base.length) || "/";
        }
        var target = path + location.search + location.hash;
        location.replace(base + "/?p=" + encodeURIComponent(target));
      })();
    </script>
  </head>
  <body></body>
</html>
`;
}

function buildSitemap(docIds, siteBase) {
  const lastmod = new Date().toISOString().slice(0, 10);
  const homeEntry = `  <url>
    <loc>${siteBase}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`;

  const docsEntry = `  <url>
    <loc>${siteBase}docs</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`;

  const docEntries = docIds.map((id, index) => `  <url>
    <loc>${siteBase}docs/${id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${index < 4 ? "0.8" : "0.7"}</priority>
  </url>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[homeEntry, docsEntry, ...docEntries].join("\n")}
</urlset>
`;
}

const manifestSource = fs.readFileSync(manifestPath, "utf8");
const docIds = extractDocIds(manifestSource);
if (docIds.length === 0) {
  console.error("sitemap generation: no doc IDs extracted from docsManifest.ts");
  process.exit(1);
}

const siteBase = resolveSiteBase();
fs.writeFileSync(notFoundOutputPath, buildNotFoundPage(siteBase));
if (!siteBase) {
  fs.rmSync(outputPath, { force: true });
  fs.writeFileSync(robotsOutputPath, "User-agent: *\nAllow: /\n");
  console.log("sitemap skipped: OXNOVEL_PUBLIC_SITE_URL is not configured.");
} else {
  const sitemap = buildSitemap(docIds, siteBase);
  fs.writeFileSync(outputPath, sitemap);
  fs.writeFileSync(
    robotsOutputPath,
    `User-agent: *\nAllow: /\n\nSitemap: ${siteBase}sitemap.xml\n`,
  );
  console.log(`sitemap generated: ${docIds.length + 2} URLs → site/public/sitemap.xml`);
}
