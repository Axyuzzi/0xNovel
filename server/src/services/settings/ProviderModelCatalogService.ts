import type { LLMProvider } from "@0xnovelagent/shared/types/llm";
import { prisma } from "../../db/prisma";

const MODEL_CATALOG_SETTING_PREFIX = "provider.modelCatalog";

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "P2021"
  );
}

function normalizeModels(models: string[]): string[] {
  return Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));
}

function parseModels(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? normalizeModels(parsed.filter((model): model is string => typeof model === "string"))
      : [];
  } catch {
    return [];
  }
}

export function getProviderModelCatalogSettingKey(provider: LLMProvider): string {
  return `${MODEL_CATALOG_SETTING_PREFIX}.${provider}`;
}

export async function getProviderModelCatalogMap(
  providers: LLMProvider[],
): Promise<Map<LLMProvider, string[]>> {
  const uniqueProviders = Array.from(new Set(providers));
  const result = new Map<LLMProvider, string[]>(
    uniqueProviders.map((provider) => [provider, []]),
  );
  if (uniqueProviders.length === 0) {
    return result;
  }

  const keys = uniqueProviders.map(getProviderModelCatalogSettingKey);
  try {
    const records = await prisma.appSetting.findMany({
      where: {
        key: {
          in: keys,
        },
      },
    });
    const providerByKey = new Map(
      uniqueProviders.map((provider) => [getProviderModelCatalogSettingKey(provider), provider]),
    );
    for (const record of records) {
      const provider = providerByKey.get(record.key);
      if (provider) {
        result.set(provider, parseModels(record.value));
      }
    }
    return result;
  } catch (error) {
    if (isMissingTableError(error)) {
      return result;
    }
    throw error;
  }
}

export async function saveProviderModelCatalog(
  provider: LLMProvider,
  models: string[],
): Promise<string[]> {
  const normalized = normalizeModels(models);
  if (normalized.length === 0) {
    return normalized;
  }

  try {
    const key = getProviderModelCatalogSettingKey(provider);
    const value = JSON.stringify(normalized);
    await prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    return normalized;
  } catch (error) {
    if (isMissingTableError(error)) {
      return normalized;
    }
    throw error;
  }
}

export async function deleteProviderModelCatalog(provider: LLMProvider): Promise<void> {
  try {
    await prisma.appSetting.deleteMany({
      where: { key: getProviderModelCatalogSettingKey(provider) },
    });
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }
}
