import type {
  IssueSummary,
  QaSettings,
  TextLayerInfo,
  TextPropertyValue,
  TypographyFamilyGroup,
  TypographyIssue,
  TypographyIssueType,
  TypographySizeGroup,
  TypographySummary,
  TypographyWeightGroup
} from "../types";
import { collectInspectableDescendants, normalizeDimension } from "../utils/nodeUtils";
import { DEFAULT_QA_SETTINGS } from "../utils/settingsUtils";

const TEXT_PREVIEW_MAX_LENGTH = 20;
const UNKNOWN_VALUE = "Unknown";
const MIXED_VALUE = "Mixed";
const MAX_RECOMMENDED_FONT_FAMILIES = 3;
const MAX_RECOMMENDED_FONT_SIZES = 8;

type FontNameInfo = {
  fontFamily: string;
  fontStyle: string;
  fontName: string;
};

export function scanTextLayers(frame: FrameNode): TextLayerInfo[] {
  const textNodes = collectInspectableDescendants(frame).filter((node) => node.type === "TEXT") as TextNode[];

  return textNodes.map((node) => {
    const position = getPositionRelativeToFrame(node, frame);
    const fontNameInfo = readFontNameInfo(node);

    return {
      id: node.id,
      name: node.name,
      text: createTextPreview(readTextCharacters(node)),
      fontSize: readFontSize(node),
      fontFamily: fontNameInfo.fontFamily,
      fontStyle: fontNameInfo.fontStyle,
      fontName: fontNameInfo.fontName,
      fontWeight: readFontWeight(node),
      colorHex: getTextColorHex(node),
      x: position.x,
      y: position.y,
      width: normalizeDimension(node.width),
      height: normalizeDimension(node.height)
    };
  });
}

export function groupTextLayersByTypography(textLayers: TextLayerInfo[]): TypographyFamilyGroup[] {
  const familyMap = new Map<string, TypographyFamilyGroup>();
  const weightMaps = new Map<string, Map<string, TypographyWeightGroup>>();
  const sizeMaps = new Map<string, Map<string, TypographySizeGroup>>();

  textLayers.forEach((layer) => {
    const familyKey = layer.fontFamily || UNKNOWN_VALUE;
    let familyGroup = familyMap.get(familyKey);

    if (!familyGroup) {
      familyGroup = {
        fontFamily: familyKey,
        count: 0,
        weights: []
      };
      familyMap.set(familyKey, familyGroup);
      weightMaps.set(familyKey, new Map());
    }

    familyGroup.count += 1;

    const weightKey = createWeightKey(layer);
    const familyWeightMap = weightMaps.get(familyKey);

    if (!familyWeightMap) {
      return;
    }

    let weightGroup = familyWeightMap.get(weightKey);

    if (!weightGroup) {
      weightGroup = {
        fontStyle: layer.fontStyle || UNKNOWN_VALUE,
        fontWeight: layer.fontWeight || UNKNOWN_VALUE,
        count: 0,
        sizes: []
      };
      familyWeightMap.set(weightKey, weightGroup);
      familyGroup.weights.push(weightGroup);
      sizeMaps.set(`${familyKey}::${weightKey}`, new Map());
    }

    weightGroup.count += 1;

    const sizeKey = String(layer.fontSize || UNKNOWN_VALUE);
    const weightSizeMap = sizeMaps.get(`${familyKey}::${weightKey}`);

    if (!weightSizeMap) {
      return;
    }

    let sizeGroup = weightSizeMap.get(sizeKey);

    if (!sizeGroup) {
      sizeGroup = {
        fontSize: layer.fontSize || UNKNOWN_VALUE,
        count: 0,
        layers: []
      };
      weightSizeMap.set(sizeKey, sizeGroup);
      weightGroup.sizes.push(sizeGroup);
    }

    sizeGroup.count += 1;
    sizeGroup.layers.push(layer);
  });

  const groups = Array.from(familyMap.values());

  groups.forEach((familyGroup) => {
    familyGroup.weights.sort(compareWeightGroups);

    familyGroup.weights.forEach((weightGroup) => {
      weightGroup.sizes.sort(compareSizeGroups);
      weightGroup.sizes.forEach((sizeGroup) => {
        sizeGroup.layers.sort(compareLayers);
      });
    });
  });

  return groups.sort(compareFamilyGroups);
}

export function createTypographySummary(
  textLayers: TextLayerInfo[],
  typographyGroups: TypographyFamilyGroup[]
): TypographySummary {
  const sizeSet = new Set<string>();
  const weightSet = new Set<string>();

  textLayers.forEach((layer) => {
    sizeSet.add(String(layer.fontSize || UNKNOWN_VALUE));
    weightSet.add(createWeightKey(layer));
  });

  return {
    totalTextLayers: textLayers.length,
    fontFamilyCount: typographyGroups.length,
    fontSizeCount: sizeSet.size,
    fontWeightCount: weightSet.size
  };
}

export function analyzeTypographyIssues(
  textLayers: TextLayerInfo[],
  typographyGroups: TypographyFamilyGroup[],
  settings: QaSettings = DEFAULT_QA_SETTINGS,
  frameId = "unknown-frame"
): TypographyIssue[] {
  const issues: TypographyIssue[] = [];
  const minTinyTextSize = settings.minTinyTextSize;
  const smallTextWarningSize = settings.smallTextWarningSize;
  const bodyTextReferenceSize = settings.bodyTextReferenceSize;

  textLayers.forEach((layer) => {
    if (typeof layer.fontSize === "number") {
      if (layer.fontSize < minTinyTextSize) {
        const currentValue = `${layer.fontSize}px`;
        issues.push({
          id: `font-size-below-minimum-${layer.id}`,
          stableId: createIssueIgnoreKey("font-size-below-minimum", frameId, currentValue, layer.id),
          ignoreKey: createIssueIgnoreKey("font-size-below-minimum", frameId, currentValue, layer.id),
          ignoreKeyAliases: createIssueIgnoreKeyAliases("font-size-below-minimum", frameId, currentValue, layer.id),
          type: "font-size-below-minimum",
          title: "字号低于弱化信息下限",
          severity: "serious",
          layerId: layer.id,
          layerName: layer.name,
          textPreview: layer.text,
          currentValue,
          suggestion: `建议 >= ${minTinyTextSize}px`,
          detail: `该文本字号为 ${layer.fontSize}px，低于当前设置的弱化信息下限 ${minTinyTextSize}px，可能影响识别。`
        });
      } else if (layer.fontSize >= minTinyTextSize && layer.fontSize < smallTextWarningSize) {
        const currentValue = `${layer.fontSize}px`;
        issues.push({
          id: `font-size-small-warning-${layer.id}`,
          stableId: createIssueIgnoreKey("font-size-small-warning", frameId, currentValue, layer.id),
          ignoreKey: createIssueIgnoreKey("font-size-small-warning", frameId, currentValue, layer.id),
          ignoreKeyAliases: createIssueIgnoreKeyAliases("font-size-small-warning", frameId, currentValue, layer.id),
          type: "font-size-small-warning",
          title: "小字号使用提示",
          severity: "warning",
          layerId: layer.id,
          layerName: layer.name,
          textPreview: layer.text,
          currentValue,
          suggestion: `正文建议 >= ${smallTextWarningSize}px；弱化信息可保留`,
          detail: `该文本字号为 ${layer.fontSize}px，适合弱化信息、辅助说明或标签。若承担正文阅读功能，建议提高到 ${smallTextWarningSize}px 或 ${bodyTextReferenceSize}px 以上。`
        });
      } else if (layer.fontSize >= smallTextWarningSize && layer.fontSize < bodyTextReferenceSize) {
        const currentValue = `${layer.fontSize}px`;
        issues.push({
          id: `font-size-body-risk-${layer.id}`,
          stableId: createIssueIgnoreKey("font-size-body-risk", frameId, currentValue, layer.id),
          ignoreKey: createIssueIgnoreKey("font-size-body-risk", frameId, currentValue, layer.id),
          ignoreKeyAliases: createIssueIgnoreKeyAliases("font-size-body-risk", frameId, currentValue, layer.id),
          type: "font-size-body-risk",
          title: "正文阅读字号偏小",
          severity: "info",
          layerId: layer.id,
          layerName: layer.name,
          textPreview: layer.text,
          currentValue,
          suggestion: `主正文建议 >= ${bodyTextReferenceSize}px；辅助说明可保留`,
          detail: `该文本字号为 ${layer.fontSize}px，位于当前正文参考字号 ${bodyTextReferenceSize}px 以下。插件无法判断语义角色，请按实际内容确认。`
        });
      }
    }

    if (hasMixedTypographyStyle(layer)) {
      const currentValue = getMixedCurrentValue(layer);
      issues.push({
        id: `mixed-text-style-${layer.id}`,
        stableId: createIssueIgnoreKey("mixed-text-style", frameId, currentValue, layer.id),
        ignoreKey: createIssueIgnoreKey("mixed-text-style", frameId, currentValue, layer.id),
        ignoreKeyAliases: createIssueIgnoreKeyAliases("mixed-text-style", frameId, currentValue, layer.id),
        type: "mixed-text-style",
        title: "文本样式混合",
        severity: "warning",
        layerId: layer.id,
        layerName: layer.name,
        textPreview: layer.text,
        currentValue,
        suggestion: "建议确认是否有意混用",
        detail: "该文本图层内部存在 Mixed 样式，可能包含多个字体、字号或字重。Mixed 不一定是错误，但建议确认是否为有意设置。"
      });
    }
  });

  const normalFontFamilyCount = typographyGroups.filter((group) => isNormalTypographyValue(group.fontFamily)).length;

  if (normalFontFamilyCount > MAX_RECOMMENDED_FONT_FAMILIES) {
    const currentValue = `${normalFontFamilyCount} 种字体`;
    issues.push({
      id: "too-many-font-families",
      stableId: createIssueIgnoreKey("too-many-font-families", frameId, currentValue),
      ignoreKey: createIssueIgnoreKey("too-many-font-families", frameId, currentValue),
      type: "too-many-font-families",
      title: "字体种类偏多",
      severity: "warning",
      currentValue,
      suggestion: "建议确认是否存在无意混用",
      detail: `当前页面检测到 ${normalFontFamilyCount} 种正常字体。移动端单页通常建议控制主要字体种类，以保持视觉统一。Mixed 不计入该数量。`
    });
  }

  const normalFontSizeCount = getNormalFontSizeCount(textLayers);

  if (normalFontSizeCount > MAX_RECOMMENDED_FONT_SIZES) {
    const currentValue = `${normalFontSizeCount} 种字号`;
    issues.push({
      id: "too-many-font-sizes",
      stableId: createIssueIgnoreKey("too-many-font-sizes", frameId, currentValue),
      ignoreKey: createIssueIgnoreKey("too-many-font-sizes", frameId, currentValue),
      type: "too-many-font-sizes",
      title: "字号层级偏多",
      severity: "warning",
      currentValue,
      suggestion: "建议确认层级是否都必要",
      detail: `当前页面检测到 ${normalFontSizeCount} 种字号。请确认这些字号是否都承担明确层级，避免文本层级过碎。`
    });
  }

  typographyGroups.forEach((group) => {
    const fontFamily = group.fontFamily;

    if (!isNormalTypographyValue(fontFamily)) {
      return;
    }

    const fontWeights = getNormalFontWeights(group);

    if (fontWeights.length < 3) {
      return;
    }

    const currentValue = `当前字体存在 ${fontWeights.length} 种字重`;
    const stableId = createIssueIgnoreKey("too-many-font-weights", frameId, currentValue, `font-family:${fontFamily}`);

    issues.push({
      id: `too-many-font-weights-${fontFamily}`,
      stableId,
      ignoreKey: stableId,
      type: "too-many-font-weights",
      title: "字重种类偏多",
      severity: "warning",
      currentValue,
      suggestion: "确认是否都承担明确层级；同类文本建议统一字重",
      detail: `${fontFamily} 检测到 ${fontWeights.length} 种正常字重：${fontWeights.join(" / ")}。Mixed 不计入该数量。`
    });
  });

  return issues.sort(compareTypographyIssues);
}

export function createIssueSummary(issues: Array<{ severity: "serious" | "warning" | "info" }>): IssueSummary {
  return {
    total: issues.length,
    serious: issues.filter((issue) => issue.severity === "serious").length,
    warning: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length
  };
}

export const createTypographyIssueSummary = createIssueSummary;

function readTextCharacters(node: TextNode): string {
  try {
    return node.characters;
  } catch {
    return "";
  }
}

function createTextPreview(characters: string): string {
  const normalizedText = characters.replace(/\s+/g, " ").trim();

  if (normalizedText.length <= TEXT_PREVIEW_MAX_LENGTH) {
    return normalizedText || "空文本";
  }

  return `${normalizedText.slice(0, TEXT_PREVIEW_MAX_LENGTH)}...`;
}

function readFontSize(node: TextNode): TextPropertyValue {
  try {
    if (node.fontSize === figma.mixed) {
      return MIXED_VALUE;
    }

    return normalizeDimension(node.fontSize);
  } catch {
    return UNKNOWN_VALUE;
  }
}

function readFontNameInfo(node: TextNode): FontNameInfo {
  try {
    if (node.fontName === figma.mixed) {
      return {
        fontFamily: MIXED_VALUE,
        fontStyle: MIXED_VALUE,
        fontName: MIXED_VALUE
      };
    }

    return {
      fontFamily: node.fontName.family || UNKNOWN_VALUE,
      fontStyle: node.fontName.style || UNKNOWN_VALUE,
      fontName: `${node.fontName.family} / ${node.fontName.style}`
    };
  } catch {
    return {
      fontFamily: UNKNOWN_VALUE,
      fontStyle: UNKNOWN_VALUE,
      fontName: UNKNOWN_VALUE
    };
  }
}

function readFontWeight(node: TextNode): TextPropertyValue {
  try {
    if (node.fontWeight === figma.mixed) {
      return MIXED_VALUE;
    }

    return node.fontWeight;
  } catch {
    return UNKNOWN_VALUE;
  }
}

function getTextColorHex(node: TextNode): string {
  try {
    const fills = node.fills;

    if (fills === figma.mixed) {
      return MIXED_VALUE;
    }

    const solidFill = fills.find((paint) => paint.type === "SOLID" && paint.visible !== false);

    if (!solidFill || solidFill.type !== "SOLID") {
      return "No solid fill";
    }

    return rgbToHex(solidFill.color);
  } catch {
    return UNKNOWN_VALUE;
  }
}

function rgbToHex(color: RGB): string {
  const channels = [color.r, color.g, color.b].map((value) => {
    const channel = Math.round(value * 255);
    return channel.toString(16).padStart(2, "0");
  });

  return `#${channels.join("")}`.toUpperCase();
}

function getPositionRelativeToFrame(node: SceneNode, frame: FrameNode): { x: number; y: number } {
  const nodeTransform = node.absoluteTransform;
  const frameTransform = frame.absoluteTransform;

  return {
    x: normalizeDimension(nodeTransform[0][2] - frameTransform[0][2]),
    y: normalizeDimension(nodeTransform[1][2] - frameTransform[1][2])
  };
}

function createWeightKey(layer: TextLayerInfo): string {
  return `${layer.fontStyle || UNKNOWN_VALUE}::${String(layer.fontWeight || UNKNOWN_VALUE)}`;
}

function createIssueIgnoreKey(
  type: TypographyIssueType,
  frameId: string,
  currentValue: string,
  layerId?: string
): string {
  const parts = layerId ? [type, frameId, layerId] : [type, frameId];
  return parts.map(normalizeIgnoreKeyPart).join("::");
}

function createIssueIgnoreKeyAliases(
  type: TypographyIssueType,
  frameId: string,
  currentValue: string,
  layerId?: string
): string[] {
  if (!layerId) {
    return [[type, frameId, currentValue].map(normalizeIgnoreKeyPart).join("::")];
  }

  return [
    [type, frameId, layerId, currentValue].map(normalizeIgnoreKeyPart).join("::"),
    [type, layerId, currentValue, frameId].map(normalizeIgnoreKeyPart).join("::")
  ];
}

function normalizeIgnoreKeyPart(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function compareFamilyGroups(a: TypographyFamilyGroup, b: TypographyFamilyGroup): number {
  if (b.count !== a.count) {
    return b.count - a.count;
  }

  return a.fontFamily.localeCompare(b.fontFamily);
}

function compareWeightGroups(a: TypographyWeightGroup, b: TypographyWeightGroup): number {
  const weightCompare = compareTextPropertyValue(a.fontWeight, b.fontWeight);

  if (weightCompare !== 0) {
    return weightCompare;
  }

  return a.fontStyle.localeCompare(b.fontStyle);
}

function compareSizeGroups(a: TypographySizeGroup, b: TypographySizeGroup): number {
  return compareTextPropertyValue(a.fontSize, b.fontSize);
}

function compareTextPropertyValue(a: TextPropertyValue, b: TextPropertyValue): number {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  if (typeof a === "number") {
    return -1;
  }

  if (typeof b === "number") {
    return 1;
  }

  return String(a).localeCompare(String(b));
}

function compareLayers(a: TextLayerInfo, b: TextLayerInfo): number {
  if (a.y !== b.y) {
    return a.y - b.y;
  }

  if (a.x !== b.x) {
    return a.x - b.x;
  }

  return a.name.localeCompare(b.name);
}

function hasMixedTypographyStyle(layer: TextLayerInfo): boolean {
  return layer.fontName === MIXED_VALUE || layer.fontSize === MIXED_VALUE || layer.fontWeight === MIXED_VALUE;
}

function getMixedCurrentValue(layer: TextLayerInfo): string {
  const mixedFields: string[] = [];

  if (layer.fontName === MIXED_VALUE) {
    mixedFields.push("字体 Mixed");
  }

  if (layer.fontSize === MIXED_VALUE) {
    mixedFields.push("字号 Mixed");
  }

  if (layer.fontWeight === MIXED_VALUE) {
    mixedFields.push("字重 Mixed");
  }

  return mixedFields.join(" / ") || MIXED_VALUE;
}

function isNormalTypographyValue(value: TextPropertyValue): boolean {
  return value !== MIXED_VALUE && value !== UNKNOWN_VALUE && value !== "";
}

function getNormalFontSizeCount(textLayers: TextLayerInfo[]): number {
  const fontSizes = new Set<number>();

  textLayers.forEach((layer) => {
    if (typeof layer.fontSize === "number") {
      fontSizes.add(layer.fontSize);
    }
  });

  return fontSizes.size;
}

function getNormalFontWeights(group: TypographyFamilyGroup): string[] {
  const fontWeights = new Set<string>();

  group.weights.forEach((weightGroup) => {
    if (isNormalTypographyValue(weightGroup.fontWeight)) {
      fontWeights.add(String(weightGroup.fontWeight));
    }
  });

  return Array.from(fontWeights).sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));
}

function compareTypographyIssues(a: TypographyIssue, b: TypographyIssue): number {
  const severityOrder = {
    serious: 0,
    warning: 1,
    info: 2
  };

  if (severityOrder[a.severity] !== severityOrder[b.severity]) {
    return severityOrder[a.severity] - severityOrder[b.severity];
  }

  return a.id.localeCompare(b.id);
}
