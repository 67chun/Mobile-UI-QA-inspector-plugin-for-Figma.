import { analyzeAlignmentIssues } from "./rules/alignmentRules";
import { inspectFrame } from "./rules/frameRules";
import { analyzeRadiusIssues } from "./rules/radiusRules";
import { analyzeSpacingIssues } from "./rules/spacingRules";
import {
  analyzeTypographyIssues,
  createIssueSummary,
  createTypographySummary,
  groupTextLayersByTypography,
  scanTextLayers
} from "./rules/typographyRules";
import type {
  InspectionResult,
  InspectIssueBase,
  QaSettings,
  UiToPluginMessage
} from "./types";
import { loadIgnoredIssueKeys, saveIgnoredIssueKeys } from "./utils/issueIgnoreUtils";
import { createSingleMessage, postToUi } from "./utils/messageUtils";
import {
  DEFAULT_QA_SETTINGS,
  loadQaSettings,
  resetQaSettings,
  saveQaSettings
} from "./utils/settingsUtils";

let currentSettings: QaSettings = { ...DEFAULT_QA_SETTINGS };
let ignoredIssueKeys = new Set<string>();
let ignoredIssueKeysLoaded = false;
let ignoredIssueKeysNeedSave = false;
let lastInspectedFrameId: string | null = null;

figma.showUI(__html__, {
  width: 390,
  height: 844,
  themeColors: true
});

postToUi({
  type: "plugin-ready",
  message: "请选择一个移动端 Frame，然后点击「开始检查」。"
});

figma.ui.onmessage = (message: UiToPluginMessage) => {
  void handleUiMessage(message);
};

async function handleUiMessage(message: UiToPluginMessage): Promise<void> {
  if (message.type === "start-inspection") {
    await runInspection();
    return;
  }

  if (message.type === "focus-node") {
    await focusNode(message.nodeId);
    return;
  }

  if (message.type === "get-settings") {
    await sendCurrentSettings();
    return;
  }

  if (message.type === "save-settings") {
    await saveSettings(message.settings);
    return;
  }

  if (message.type === "reset-settings") {
    await resetSettings();
    return;
  }

  if (message.type === "ignore-issue") {
    await ignoreIssue(message.ignoreKey);
    return;
  }

  if (message.type === "restore-issue") {
    await restoreIssue(message.ignoreKey);
  }
}

async function runInspection(frameId?: string | null): Promise<void> {
  await ensureIgnoredIssueKeysLoaded();

  const selectedFrame = await getFrameForInspection(frameId);

  if (!selectedFrame) {
    return;
  }

  lastInspectedFrameId = selectedFrame.id;

  const frameResult = inspectFrame(selectedFrame, currentSettings);
  const textLayers = scanTextLayers(selectedFrame);
  const typographyGroups = groupTextLayersByTypography(textLayers);
  const typographySummary = createTypographySummary(textLayers, typographyGroups);
  const allTypographyIssues = analyzeTypographyIssues(
    textLayers,
    typographyGroups,
    currentSettings,
    selectedFrame.id
  );
  const allSpacingIssues = analyzeSpacingIssues(selectedFrame, currentSettings);
  const allRadiusIssues = analyzeRadiusIssues(selectedFrame);
  const allAlignmentIssues = analyzeAlignmentIssues(selectedFrame, currentSettings);
  const {
    activeIssues: typographyIssues,
    ignoredIssues: ignoredTypographyIssues
  } = splitIgnoredIssues(allTypographyIssues);
  const {
    activeIssues: spacingIssues,
    ignoredIssues: ignoredSpacingIssues
  } = splitIgnoredIssues(allSpacingIssues);
  const {
    activeIssues: radiusIssues,
    ignoredIssues: ignoredRadiusIssues
  } = splitIgnoredIssues(allRadiusIssues);
  const {
    activeIssues: alignmentIssues,
    ignoredIssues: ignoredAlignmentIssues
  } = splitIgnoredIssues(allAlignmentIssues);

  await saveIgnoredIssueKeysIfNeeded();

  const result: InspectionResult = {
    ...frameResult,
    textLayers,
    typographyGroups,
    typographySummary,
    typographyIssues,
    ignoredTypographyIssues,
    typographyIssueSummary: createIssueSummary(typographyIssues),
    spacingIssues,
    ignoredSpacingIssues,
    spacingIssueSummary: createIssueSummary(spacingIssues),
    radiusIssues,
    ignoredRadiusIssues,
    radiusIssueSummary: createIssueSummary(radiusIssues),
    alignmentIssues,
    ignoredAlignmentIssues,
    alignmentIssueSummary: createIssueSummary(alignmentIssues)
  };

  postToUi({
    type: "inspection-result",
    result
  });
}

async function getFrameForInspection(frameId?: string | null): Promise<FrameNode | null> {
  if (frameId) {
    const node = await figma.getNodeByIdAsync(frameId);

    if (node && node.type === "FRAME") {
      return node;
    }

    postToUi({
      type: "inspection-error",
      messages: [createSingleMessage("warning", "未找到上次检查的 Frame，请重新选中移动端 Frame。")]
    });
    return null;
  }

  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    postToUi({
      type: "inspection-error",
      messages: [createSingleMessage("warning", "请先选中一个移动端 Frame。")]
    });
    return null;
  }

  const selectedNode = selection[0];

  if (selectedNode.type !== "FRAME") {
    postToUi({
      type: "inspection-error",
      messages: [
        createSingleMessage("warning", "当前选中的对象不是 Frame，请选中需要检查的移动端页面。")
      ]
    });
    return null;
  }

  return selectedNode;
}

async function sendCurrentSettings(): Promise<void> {
  currentSettings = await loadQaSettings();
  await ensureIgnoredIssueKeysLoaded();

  postToUi({
    type: "settings-loaded",
    settings: currentSettings
  });
}

async function saveSettings(settings: QaSettings): Promise<void> {
  try {
    currentSettings = await saveQaSettings(settings);
    postToUi({
      type: "settings-saved",
      settings: currentSettings,
      message: "设置已保存"
    });
  } catch {
    currentSettings = { ...DEFAULT_QA_SETTINGS };
    postToUi({
      type: "settings-error",
      settings: currentSettings,
      message: "设置保存失败，已回退到默认设置。"
    });
  }
}

async function resetSettings(): Promise<void> {
  try {
    currentSettings = await resetQaSettings();
    postToUi({
      type: "settings-reset",
      settings: currentSettings,
      message: "已恢复默认设置"
    });
  } catch {
    currentSettings = { ...DEFAULT_QA_SETTINGS };
    postToUi({
      type: "settings-error",
      settings: currentSettings,
      message: "恢复默认设置失败，已使用默认设置。"
    });
  }
}

async function ignoreIssue(ignoreKey: string): Promise<void> {
  await ensureIgnoredIssueKeysLoaded();
  ignoredIssueKeys.add(ignoreKey);

  try {
    await saveIgnoredIssueKeys(ignoredIssueKeys);
  } catch {
    ignoredIssueKeys.delete(ignoreKey);
  }
}

async function restoreIssue(ignoreKey: string): Promise<void> {
  await ensureIgnoredIssueKeysLoaded();
  ignoredIssueKeys.delete(ignoreKey);

  try {
    await saveIgnoredIssueKeys(ignoredIssueKeys);
  } catch {
    ignoredIssueKeys.add(ignoreKey);
  }
}

async function ensureIgnoredIssueKeysLoaded(): Promise<void> {
  if (ignoredIssueKeysLoaded) {
    return;
  }

  ignoredIssueKeys = await loadIgnoredIssueKeys();
  ignoredIssueKeysLoaded = true;
}

function splitIgnoredIssues<TIssue extends InspectIssueBase>(issues: TIssue[]): {
  activeIssues: TIssue[];
  ignoredIssues: TIssue[];
} {
  const activeIssues: TIssue[] = [];
  const ignoredIssues: TIssue[] = [];
  const seenIssueKeys = new Set<string>();

  issues.forEach((issue) => {
    const matchedIgnoreKey = getMatchedIgnoredIssueKey(issue);
    const primaryIgnoreKey = getPrimaryIgnoreKey(issue);

    if (seenIssueKeys.has(primaryIgnoreKey)) {
      return;
    }

    seenIssueKeys.add(primaryIgnoreKey);

    if (matchedIgnoreKey) {
      if (matchedIgnoreKey !== primaryIgnoreKey) {
        ignoredIssueKeys.delete(matchedIgnoreKey);
        ignoredIssueKeys.add(primaryIgnoreKey);
        ignoredIssueKeysNeedSave = true;
      }

      ignoredIssues.push(issue);
    } else {
      activeIssues.push(issue);
    }
  });

  return {
    activeIssues,
    ignoredIssues
  };
}

function getMatchedIgnoredIssueKey(issue: InspectIssueBase): string | null {
  if (ignoredIssueKeys.has(issue.stableId)) {
    return issue.stableId;
  }

  if (ignoredIssueKeys.has(issue.ignoreKey)) {
    return issue.ignoreKey;
  }

  const aliases = issue.ignoreKeyAliases || [];

  for (const alias of aliases) {
    if (ignoredIssueKeys.has(alias)) {
      return alias;
    }
  }

  return null;
}

function getPrimaryIgnoreKey(issue: InspectIssueBase): string {
  return issue.stableId || issue.ignoreKey;
}

async function saveIgnoredIssueKeysIfNeeded(): Promise<void> {
  if (!ignoredIssueKeysNeedSave) {
    return;
  }

  ignoredIssueKeysNeedSave = false;

  try {
    await saveIgnoredIssueKeys(ignoredIssueKeys);
  } catch {
    // Ignore migration save failures; explicit ignore/restore actions still handle rollback.
  }
}

async function focusNode(nodeId: string): Promise<void> {
  const node = await figma.getNodeByIdAsync(nodeId);

  if (!node || !isSceneNode(node)) {
    postToUi({
      type: "focus-node-result",
      success: false,
      message: "未找到对应图层，可能已被删除或移动。"
    });
    return;
  }

  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);

  postToUi({
    type: "focus-node-result",
    success: true,
    message: `已定位到图层：${node.name}`
  });
}

function isSceneNode(node: BaseNode): node is SceneNode {
  return "absoluteTransform" in node;
}
