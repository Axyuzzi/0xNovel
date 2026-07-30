export type ProductMode = "legacy" | "consumer";

export function resolveProductMode(): ProductMode {
  return process.env.AI_NOVEL_PRODUCT_MODE?.trim().toLowerCase() === "consumer"
    ? "consumer"
    : "legacy";
}

export function isConsumerProductMode(): boolean {
  return resolveProductMode() === "consumer";
}
