import type { ApiResponse } from "@0xnovelagent/shared/types/api";
import type { AgentCatalog } from "@0xnovelagent/shared/types/agent";
import { apiClient } from "./client";

export async function getAgentCatalog() {
  const { data } = await apiClient.get<ApiResponse<AgentCatalog>>("/agent-catalog");
  return data;
}
