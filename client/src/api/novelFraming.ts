import type { ApiResponse } from "@0xnovelagent/shared/types/api";
import type { BookFramingSuggestion, BookFramingSuggestionInput } from "@0xnovelagent/shared/types/novelFraming";
import { apiClient } from "./client";

export async function suggestBookFraming(payload: BookFramingSuggestionInput) {
  const { data } = await apiClient.post<ApiResponse<BookFramingSuggestion>>("/novels/framing/suggest", payload);
  return data;
}
