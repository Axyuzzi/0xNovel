import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function normalizePublicSiteUrl(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }
  const url = new URL(trimmed);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("OXNOVEL_PUBLIC_SITE_URL must use http or https.");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/?$/, "/");
}

const publicSiteUrl = normalizePublicSiteUrl(process.env.OXNOVEL_PUBLIC_SITE_URL);
const publicSiteBasePath = publicSiteUrl
  ? new URL(publicSiteUrl).pathname.replace(/\/?$/, "/")
  : "/";

export default defineConfig({
  base: publicSiteBasePath,
  define: {
    __OXNOVEL_PUBLIC_SITE_URL__: JSON.stringify(publicSiteUrl),
  },
  server: {
    port: 4173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    manifest: true,
    reportCompressedSize: false,
  },
  plugins: [react()],
});
