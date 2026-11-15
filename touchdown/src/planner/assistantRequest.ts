import type { AppState } from "../state";
import { comparisonRequest } from "./comparison";

/** Keep the chat and the deterministic comparison on exactly the same inputs. */
export function buildChatRequest(state: AppState, message: string, sessionId?: string) {
  const request = comparisonRequest(state);
  if (!request || request.scenarioIds.length === 0) return null;
  const { constraints, ...context } = request;
  return { message, locale: state.locale, sessionId, context, constraints };
}
