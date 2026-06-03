import type { AlignmentIssue, AlignmentIssueType, QaSettings } from "../types";
import {
  collectInspectableParents,
  type InspectableParentNode,
  normalizeDimension
} from "../utils/nodeUtils";
import { DEFAULT_QA_SETTINGS } from "../utils/settingsUtils";

const BACKGROUND_SIZE_TOLERANCE = 2;
const ALIGNMENT_TOLERANCE = 2;
const BASE_ALIGNMENT_UNIT = 2;
const MAX_NEARBY_GAP = 80;
const SIMILAR_SIZE_RATIO = 0.15;
const CENTER_ALIGNMENT_TOLERANCE = 4;
const EDGE_ALIGNMENT_TOLERANCE = 2;
const EDGE_ALIGNMENT_RATIO = 0.66;
const FULL_BLEED_EDGE_TOLERANCE = 4;
const CONTENT_MARGIN_TOLERANCE = 4;
const WIDTH_BUCKET_SIZE = 16;
const CUSTOM_EDGE_BUCKET_SIZE = 8;
const LARGE_WIDTH_DIFFERENCE_RATIO = 0.35;

type MeasurableSceneNode = SceneNode & {
  width: number;
  height: number;
  absoluteBoundingBox: Rect | null;
};

type Axis = "horizontal" | "vertical";
type InferredHorizontalLayout = "left" | "right" | "center" | "unknown";

interface AlignmentNodeInfo {
  node: MeasurableSceneNode;
  id: string;
  name: string;
  bounds: Rect;
  nameKey: string;
}

interface AlignmentFeature {
  kind: "full-bleed" | "content" | "custom";
  groupKey: string;
  widthKey: string;
  isFullBleed: boolean;
}

export function analyzeAlignmentIssues(
  frame: FrameNode,
  settings: QaSettings = DEFAULT_QA_SETTINGS
): AlignmentIssue[] {
  const issues: AlignmentIssue[] = [];
  const parents = collectInspectableParents(frame);

  parents.forEach((parent) => {
    const parentBounds = getParentBounds(parent);

    if (!parentBounds || isAutoLayoutParent(parent)) {
      return;
    }

    const nodes = parent.children
      .filter((node) => shouldCheckNode(node, parentBounds))
      .map((node) => createAlignmentNodeInfo(node as MeasurableSceneNode));
    const horizontalLayout = inferHorizontalLayout(parentBounds, nodes);

    if (horizontalLayout === "left") {
      issues.push(...analyzeLeftAlignment(nodes, parentBounds, frame.id, settings));
    }

    issues.push(...analyzeVerticalCenterAlignment(nodes, frame.id));
    issues.push(...analyzeSimilarNodeAlignment(nodes, parentBounds, frame.id, settings));
  });

  return dedupeAlignmentIssues(issues);
}

function analyzeLeftAlignment(
  nodes: AlignmentNodeInfo[],
  parentBounds: Rect,
  frameId: string,
  settings: QaSettings
): AlignmentIssue[] {
  const issues: AlignmentIssue[] = [];
  const groups = groupNodesByAlignmentFeature(nodes, parentBounds, settings);

  groups.forEach((groupNodes) => {
    const sortedNodes = [...groupNodes].sort((a, b) => a.bounds.y - b.bounds.y);

    for (let index = 0; index < sortedNodes.length - 1; index += 1) {
    const first = sortedNodes[index];
    const second = sortedNodes[index + 1];

    if (!isNearbyVerticalPair(first.bounds, second.bounds) || !haveComparableWidth(first, second)) {
      continue;
    }

    const offset = normalizeDimension(Math.abs(first.bounds.x - second.bounds.x));

    if (!shouldReportOffset(offset)) {
      continue;
    }

    issues.push(createAlignmentIssue({
      type: "alignment-left-offset",
      frameId,
      first,
      second,
      title: "左对齐疑似不一致",
      currentValue: `x 差 ${offset}px`,
      suggestion: "建议确认同组元素左边缘是否需要统一",
      detail: `${first.name} 与 ${second.name} 在同一父级下位置接近，但左边缘相差 ${offset}px。`,
      direction: "horizontal"
    }));
    }
  });

  return issues;
}

function analyzeVerticalCenterAlignment(nodes: AlignmentNodeInfo[], frameId: string): AlignmentIssue[] {
  const issues: AlignmentIssue[] = [];
  const sortedNodes = [...nodes].sort((a, b) => a.bounds.x - b.bounds.x);

  for (let index = 0; index < sortedNodes.length - 1; index += 1) {
    const first = sortedNodes[index];
    const second = sortedNodes[index + 1];

    if (!isNearbyHorizontalPair(first.bounds, second.bounds) || !isLikelyInlinePair(first.bounds, second.bounds)) {
      continue;
    }

    const offset = normalizeDimension(Math.abs(getCenterY(first.bounds) - getCenterY(second.bounds)));

    if (offset <= ALIGNMENT_TOLERANCE) {
      continue;
    }

    issues.push(createAlignmentIssue({
      type: "alignment-center-offset",
      frameId,
      first,
      second,
      title: "垂直中心疑似错位",
      currentValue: `中心线差 ${offset}px`,
      suggestion: "建议确认图标、文字或按钮内容是否需要垂直居中",
      detail: `${first.name} 与 ${second.name} 横向相邻，但垂直中心线相差 ${offset}px。`,
      direction: "vertical"
    }));
  }

  return issues;
}

function analyzeSimilarNodeAlignment(
  nodes: AlignmentNodeInfo[],
  parentBounds: Rect,
  frameId: string,
  settings: QaSettings
): AlignmentIssue[] {
  const issues: AlignmentIssue[] = [];
  const sortedByX = [...nodes].sort((a, b) => a.bounds.x - b.bounds.x);
  const sortedByY = [...nodes].sort((a, b) => a.bounds.y - b.bounds.y);

  for (let index = 0; index < sortedByX.length - 1; index += 1) {
    const first = sortedByX[index];
    const second = sortedByX[index + 1];

    if (
      !areComparableSimilarNodes(first, second, parentBounds, settings) ||
      !rangesOverlap(first.bounds.y, first.bounds.y + first.bounds.height, second.bounds.y, second.bounds.y + second.bounds.height) ||
      getHorizontalGap(first.bounds, second.bounds) > MAX_NEARBY_GAP
    ) {
      continue;
    }

    const offset = normalizeDimension(Math.abs(first.bounds.y - second.bounds.y));

    if (offset <= ALIGNMENT_TOLERANCE) {
      continue;
    }

    issues.push(createAlignmentIssue({
      type: "alignment-similar-offset",
      frameId,
      first,
      second,
      title: "同类元素对齐疑似不一致",
      currentValue: `y 差 ${offset}px`,
      suggestion: "建议确认同一行同类卡片或按钮的顶部是否对齐",
      detail: `${first.name} 与 ${second.name} 尺寸或名称相近，但顶部 y 值相差 ${offset}px。`,
      direction: "vertical"
    }));
  }

  for (let index = 0; index < sortedByY.length - 1; index += 1) {
    const first = sortedByY[index];
    const second = sortedByY[index + 1];

    if (
      !areComparableSimilarNodes(first, second, parentBounds, settings) ||
      !rangesOverlap(first.bounds.x, first.bounds.x + first.bounds.width, second.bounds.x, second.bounds.x + second.bounds.width) ||
      getVerticalGap(first.bounds, second.bounds) > MAX_NEARBY_GAP
    ) {
      continue;
    }

    const offset = normalizeDimension(Math.abs(first.bounds.x - second.bounds.x));

    if (offset <= ALIGNMENT_TOLERANCE) {
      continue;
    }

    issues.push(createAlignmentIssue({
      type: "alignment-similar-offset",
      frameId,
      first,
      second,
      title: "同类元素对齐疑似不一致",
      currentValue: `x 差 ${offset}px`,
      suggestion: "建议确认同一列同类卡片或按钮的左边缘是否对齐",
      detail: `${first.name} 与 ${second.name} 尺寸或名称相近，但左侧 x 值相差 ${offset}px。`,
      direction: "horizontal"
    }));
  }

  return issues;
}

function createAlignmentIssue({
  type,
  frameId,
  first,
  second,
  title,
  currentValue,
  suggestion,
  detail,
  direction
}: {
  type: AlignmentIssueType;
  frameId: string;
  first: AlignmentNodeInfo;
  second: AlignmentNodeInfo;
  title: string;
  currentValue: string;
  suggestion: string;
  detail: string;
  direction: Axis;
}): AlignmentIssue {
  const stableId = createAlignmentStableId(type, frameId, first.id, second.id, direction);

  return {
    id: `${type}-${direction}-${first.id}-${second.id}`,
    stableId,
    ignoreKey: stableId,
    type,
    title,
    severity: "warning",
    layerId: first.id,
    layerName: `${first.name} / ${second.name}`,
    relatedLayerId: second.id,
    relatedLayerName: second.name,
    currentValue,
    suggestion,
    detail,
    direction
  };
}

function shouldCheckNode(node: SceneNode, parentBounds: Rect): node is MeasurableSceneNode {
  if (!node.visible || !isMeasurableNode(node)) {
    return false;
  }

  const bounds = node.absoluteBoundingBox;

  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return false;
  }

  if (
    bounds.width >= parentBounds.width - BACKGROUND_SIZE_TOLERANCE &&
    bounds.height >= parentBounds.height - BACKGROUND_SIZE_TOLERANCE
  ) {
    return false;
  }

  return true;
}

function isMeasurableNode(node: SceneNode): node is MeasurableSceneNode {
  return "width" in node && "height" in node && "absoluteBoundingBox" in node;
}

function createAlignmentNodeInfo(node: MeasurableSceneNode): AlignmentNodeInfo {
  return {
    node,
    id: node.id,
    name: node.name,
    bounds: getBounds(node),
    nameKey: createNameKey(node.name)
  };
}

function isAutoLayoutParent(parent: InspectableParentNode): boolean {
  const layoutMode = readAutoLayoutValue(parent, "layoutMode");

  return layoutMode === "HORIZONTAL" || layoutMode === "VERTICAL";
}

function inferHorizontalLayout(parentBounds: Rect, nodes: AlignmentNodeInfo[]): InferredHorizontalLayout {
  if (nodes.length < 2) {
    return "unknown";
  }

  const contentBounds = getContentBounds(nodes);
  const groupCenterX = normalizeDimension(contentBounds.x + contentBounds.width / 2);
  const parentCenterX = normalizeDimension(parentBounds.x + parentBounds.width / 2);

  if (Math.abs(groupCenterX - parentCenterX) <= CENTER_ALIGNMENT_TOLERANCE) {
    return "center";
  }

  if (hasMajorityAlignedEdge(nodes, "left")) {
    return "left";
  }

  if (hasMajorityAlignedEdge(nodes, "right")) {
    return "right";
  }

  return "unknown";
}

function getContentBounds(nodes: AlignmentNodeInfo[]): Rect {
  const minX = Math.min(...nodes.map((node) => node.bounds.x));
  const minY = Math.min(...nodes.map((node) => node.bounds.y));
  const maxX = Math.max(...nodes.map((node) => node.bounds.x + node.bounds.width));
  const maxY = Math.max(...nodes.map((node) => node.bounds.y + node.bounds.height));

  return {
    x: minX,
    y: minY,
    width: normalizeDimension(maxX - minX),
    height: normalizeDimension(maxY - minY)
  };
}

function hasMajorityAlignedEdge(nodes: AlignmentNodeInfo[], edge: "left" | "right"): boolean {
  const values = nodes.map((node) => edge === "left" ? node.bounds.x : node.bounds.x + node.bounds.width);
  const largestGroupSize = values.reduce((maxGroupSize, value) => {
    const groupSize = values.filter((candidate) => Math.abs(candidate - value) <= EDGE_ALIGNMENT_TOLERANCE).length;
    return Math.max(maxGroupSize, groupSize);
  }, 0);

  return largestGroupSize / values.length >= EDGE_ALIGNMENT_RATIO;
}

function readAutoLayoutValue(node: SceneNode, key: "layoutMode"): string {
  if (!(key in node)) {
    return "";
  }

  const value = (node as SceneNode & Record<typeof key, unknown>)[key];

  return typeof value === "string" ? value : "";
}

function isNearbyVerticalPair(first: Rect, second: Rect): boolean {
  if (rangesOverlap(first.y, first.y + first.height, second.y, second.y + second.height)) {
    return false;
  }

  if (!rangesOverlap(first.x, first.x + first.width, second.x, second.x + second.width)) {
    return false;
  }

  const gap = Math.max(0, second.y - (first.y + first.height), first.y - (second.y + second.height));

  return gap <= MAX_NEARBY_GAP;
}

function isNearbyHorizontalPair(first: Rect, second: Rect): boolean {
  if (!rangesOverlap(first.y, first.y + first.height, second.y, second.y + second.height)) {
    return false;
  }

  const gap = Math.max(0, second.x - (first.x + first.width), first.x - (second.x + second.width));

  return gap <= MAX_NEARBY_GAP;
}

function getHorizontalGap(first: Rect, second: Rect): number {
  return Math.max(0, second.x - (first.x + first.width), first.x - (second.x + second.width));
}

function getVerticalGap(first: Rect, second: Rect): number {
  return Math.max(0, second.y - (first.y + first.height), first.y - (second.y + second.height));
}

function isLikelyInlinePair(first: Rect, second: Rect): boolean {
  return Math.min(first.height, second.height) <= 32 || Math.max(first.height, second.height) <= 48;
}

function shouldReportOffset(offset: number): boolean {
  return offset > ALIGNMENT_TOLERANCE || (offset > 0 && offset % BASE_ALIGNMENT_UNIT !== 0);
}

function groupNodesByAlignmentFeature(
  nodes: AlignmentNodeInfo[],
  parentBounds: Rect,
  settings: QaSettings
): AlignmentNodeInfo[][] {
  const groups = new Map<string, AlignmentNodeInfo[]>();

  nodes.forEach((node) => {
    const feature = createAlignmentFeature(node, parentBounds, settings);
    const group = groups.get(feature.groupKey) || [];
    group.push(node);
    groups.set(feature.groupKey, group);
  });

  return Array.from(groups.values()).filter((group) => group.length > 1);
}

function createAlignmentFeature(
  node: AlignmentNodeInfo,
  parentBounds: Rect,
  settings: QaSettings
): AlignmentFeature {
  const edges = getRelativeEdges(node.bounds, parentBounds);
  const widthKey = createWidthKey(node.bounds.width, parentBounds.width);

  if (isFullBleedLikeNode(node, parentBounds, settings)) {
    return {
      kind: "full-bleed",
      groupKey: `full-bleed:${widthKey}`,
      widthKey,
      isFullBleed: true
    };
  }

  const contentMargin = getNearestContentMargin(edges.left, settings);

  if (contentMargin !== null && node.bounds.width < parentBounds.width - contentMargin) {
    return {
      kind: "content",
      groupKey: `content:${contentMargin}:${widthKey}`,
      widthKey,
      isFullBleed: false
    };
  }

  return {
    kind: "custom",
    groupKey: `custom:${Math.round(edges.left / CUSTOM_EDGE_BUCKET_SIZE)}:${widthKey}`,
    widthKey,
    isFullBleed: false
  };
}

function isFullBleedLikeNode(
  node: AlignmentNodeInfo,
  parentBounds: Rect,
  settings: QaSettings
): boolean {
  const edges = getRelativeEdges(node.bounds, parentBounds);
  const contentMargin = getSafeContentMargin(settings);
  const widthRatio = node.bounds.width / parentBounds.width;
  const nearParentEdge = edges.left <= FULL_BLEED_EDGE_TOLERANCE || edges.right <= FULL_BLEED_EDGE_TOLERANCE;
  const nearFullWidth = node.bounds.width >= parentBounds.width - Math.max(contentMargin, FULL_BLEED_EDGE_TOLERANCE * 2);
  const smallerThanContentMargins = edges.left < contentMargin * 0.75 && edges.right < contentMargin * 0.75;

  return nearFullWidth || (nearParentEdge && widthRatio >= 0.65) || (smallerThanContentMargins && widthRatio >= 0.8);
}

function getRelativeEdges(bounds: Rect, parentBounds: Rect): {
  left: number;
  right: number;
} {
  return {
    left: normalizeDimension(bounds.x - parentBounds.x),
    right: normalizeDimension(parentBounds.x + parentBounds.width - (bounds.x + bounds.width))
  };
}

function getNearestContentMargin(left: number, settings: QaSettings): number | null {
  const candidates = Array.from(new Set([
    getSafeContentMargin(settings),
    12,
    16,
    24
  ])).sort((a, b) => a - b);
  const match = candidates.find((candidate) => Math.abs(left - candidate) <= CONTENT_MARGIN_TOLERANCE);

  return match ?? null;
}

function getSafeContentMargin(settings: QaSettings): number {
  return Math.max(1, settings.pageHorizontalMargin || DEFAULT_QA_SETTINGS.pageHorizontalMargin);
}

function createWidthKey(width: number, parentWidth: number): string {
  const ratio = parentWidth > 0 ? width / parentWidth : 0;

  if (ratio >= 0.85) {
    return "wide";
  }

  if (ratio >= 0.45) {
    return `medium-${Math.round(width / WIDTH_BUCKET_SIZE)}`;
  }

  return `small-${Math.round(width / WIDTH_BUCKET_SIZE)}`;
}

function haveComparableWidth(first: AlignmentNodeInfo, second: AlignmentNodeInfo): boolean {
  const max = Math.max(first.bounds.width, second.bounds.width);

  if (max === 0) {
    return false;
  }

  return Math.min(first.bounds.width, second.bounds.width) / max >= LARGE_WIDTH_DIFFERENCE_RATIO;
}

function areComparableSimilarNodes(
  first: AlignmentNodeInfo,
  second: AlignmentNodeInfo,
  parentBounds: Rect,
  settings: QaSettings
): boolean {
  const firstFeature = createAlignmentFeature(first, parentBounds, settings);
  const secondFeature = createAlignmentFeature(second, parentBounds, settings);

  if (firstFeature.isFullBleed !== secondFeature.isFullBleed || !haveComparableWidth(first, second)) {
    return false;
  }

  return (
    first.nameKey === second.nameKey ||
    (
      isSimilarNumber(first.bounds.width, second.bounds.width) &&
      isSimilarNumber(first.bounds.height, second.bounds.height)
    )
  );
}

function isSimilarNumber(first: number, second: number): boolean {
  const max = Math.max(first, second);

  if (max === 0) {
    return false;
  }

  return Math.abs(first - second) / max <= SIMILAR_SIZE_RATIO;
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return Math.min(endA, endB) - Math.max(startA, startB) > 0;
}

function getCenterY(bounds: Rect): number {
  return normalizeDimension(bounds.y + bounds.height / 2);
}

function getParentBounds(parent: InspectableParentNode): Rect | null {
  if ("absoluteBoundingBox" in parent && parent.absoluteBoundingBox) {
    return parent.absoluteBoundingBox;
  }

  return null;
}

function getBounds(node: MeasurableSceneNode): Rect {
  return node.absoluteBoundingBox || {
    x: node.absoluteTransform[0][2],
    y: node.absoluteTransform[1][2],
    width: node.width,
    height: node.height
  };
}

function createNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\d+/g, "")
    .replace(/[_\-#]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
}

function createAlignmentStableId(
  type: AlignmentIssueType,
  frameId: string,
  firstNodeId: string,
  secondNodeId: string,
  direction: Axis
): string {
  return [type, frameId, firstNodeId, secondNodeId, direction]
    .map((part) => part.replace(/\s+/g, " ").trim())
    .join("::");
}

function dedupeAlignmentIssues(issues: AlignmentIssue[]): AlignmentIssue[] {
  const seenKeys = new Set<string>();
  const results: AlignmentIssue[] = [];

  issues.forEach((issue) => {
    if (seenKeys.has(issue.stableId)) {
      return;
    }

    seenKeys.add(issue.stableId);
    results.push(issue);
  });

  return results;
}
