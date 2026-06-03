import type { CheckMessage, PluginToUiMessage } from "../types";

export function postToUi(message: PluginToUiMessage): void {
  figma.ui.postMessage(message);
}

export function createSingleMessage(severity: CheckMessage["severity"], title: string): CheckMessage {
  return {
    severity,
    title
  };
}
