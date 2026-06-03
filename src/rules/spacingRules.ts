import type { QaSettings, SpacingIssue, SpacingIssueType } from "../types";
import {
  collectInspectableParents,
  type InspectableParentNode,
  normalizeDimension
} from "../utils/nodeUtils";
import { DEFAULT_QA_SETTINGS } from "../utils/settingsUtils";

const MIN_SPACING_TO_CHECK = 2;
const MAX_SPACING_TO_CHECK = 80;
const BACKGROUND_SIZE_TOLERANCE = 2;

type MeasurableSceneNode = SceneNode & {
  width: number;
  height: number;
  absoluteBoundingBox: Rect | null;
};

type Direction = "horizontal" | "vertical";
type Edge = "left" | "right" | "top" | "bottom";
type EdgePair = "horizontal" | "vertical";
type HorizontalEdgeMode = "left-only" | "right-only" | "center-mismatch-only" | "pair-check" | "skip";

const CENTER_ALIGNMENT_TOLERANCE = 4;
const EDGE_ALIGNMENT_TOLERANCE = 2;
const EDGE_ALIGNMENT_RATIO = 0.66;
const BUTTON_SHAPE_TOLERANCE = 2;
const BUTTON_RADIUS_TOLERANCE = 2;
const BUTTON_PADDING_SYMMETRY_TOLERANCE = 2;
const BUTTON_CENTER_TOLERANCE = 2;
const ICON_CLUSTER_MAX_CHILDREN = 8;
const ICON_CLUSTER_MAX_SIZE_RATIO = 0.8;

interface SpacingMultipleInfo {
  isValid: boolean;
  suggestions: string;
}

interface EdgeSpacing {
  edge: Edge;
  value: number;
  label: string;
}

interface HorizontalContentEdges {
  left: EdgeSpacing;
  right: EdgeSpacing;
  leftNode: MeasurableSceneNode;
  rightNode: MeasurableSceneNode;
}

interface IconButtonPaddingState {
  representativeNode: MeasurableSceneNode;
  edges: Record<Edge, EdgeSpacing>;
  isHorizontallyCentered: boolean;
  isVerticallyCentered: boolean;
}

export function analyzeSpacingIssues(
  frame: FrameNode,
  settings: QaSettings = DEFAULT_QA_SETTINGS
): SpacingIssue[] {
  const issues: SpacingIssue[] = [];
  const parents = collectInspectableParents(frame);

  parents.forEach((parent) => {
    const parentBounds = getParentBounds(parent);

    if (!parentBounds) {
      return;
    }

    const children = parent.children.filter((node) => shouldCheckNode(node, parentBounds)) as MeasurableSceneNode[];
    const iconButtonPadding = getIconButtonPaddingState(parent, parentBounds, children);

    if (iconButtonPadding) {
      issues.push(...analyzeIconButtonClusterPadding(parent, iconButtonPadding, frame.id));
      return;
    }

    issues.push(...analyzeEdgeSpacing(parent, parentBounds, children, frame.id, settings));
    issues.push(...analyzeVerticalSpacing(children, frame.id, settings));
    issues.push(...analyzeHorizontalSpacing(children, frame.id, settings));
  });

  return dedupeSpacingIssues(issues);
}

function analyzeVerticalSpacing(
  nodes: MeasurableSceneNode[],
  frameId: string,
  settings: QaSettings
): SpacingIssue[] {
  const sortedNodes = [...nodes].sort((a, b) => getBounds(a).y - getBounds(b).y);
  const issues: SpacingIssue[] = [];

  for (let index = 0; index < sortedNodes.length - 1; index += 1) {
    const firstNode = sortedNodes[index];
    const secondNode = sortedNodes[index + 1];
    const firstBounds = getBounds(firstNode);
    const secondBounds = getBounds(secondNode);
    const gap = normalizeDimension(secondBounds.y - (firstBounds.y + firstBounds.height));

    if (!shouldCheckSpacing(gap) || !rangesOverlap(firstBounds.x, firstBounds.x + firstBounds.width, secondBounds.x, secondBounds.x + secondBounds.width)) {
      continue;
    }

    const issue = createGapIssue(firstNode, secondNode, gap, "vertical", frameId, settings);

    if (issue) {
      issues.push(issue);
    }
  }

  return issues;
}

function analyzeHorizontalSpacing(
  nodes: MeasurableSceneNode[],
  frameId: string,
  settings: QaSettings
): SpacingIssue[] {
  const sortedNodes = [...nodes].sort((a, b) => getBounds(a).x - getBounds(b).x);
  const issues: SpacingIssue[] = [];

  for (let index = 0; index < sortedNodes.length - 1; index += 1) {
    const firstNode = sortedNodes[index];
    const secondNode = sortedNodes[index + 1];
    const firstBounds = getBounds(firstNode);
    const secondBounds = getBounds(secondNode);
    const gap = normalizeDimension(secondBounds.x - (firstBounds.x + firstBounds.width));

    if (!shouldCheckSpacing(gap) || !rangesOverlap(firstBounds.y, firstBounds.y + firstBounds.height, secondBounds.y, secondBounds.y + secondBounds.height)) {
      continue;
    }

    const issue = createGapIssue(firstNode, secondNode, gap, "horizontal", frameId, settings);

    if (issue) {
      issues.push(issue);
    }
  }

  return issues;
}

function analyzeEdgeSpacing(
  parent: InspectableParentNode,
  parentBounds: Rect,
  nodes: MeasurableSceneNode[],
  frameId: string,
  settings: QaSettings
): SpacingIssue[] {
  const issues: SpacingIssue[] = [];

  const iconButtonPadding = getIconButtonPaddingState(parent, parentBounds, nodes);

  if (iconButtonPadding) {
    return analyzeIconButtonClusterPadding(parent, iconButtonPadding, frameId);
  }

  const horizontalEdgeMode = getHorizontalEdgeMode(parent, parentBounds, nodes);

  if (horizontalEdgeMode !== "skip" && horizontalEdgeMode !== "pair-check") {
    issues.push(...createHorizontalEdgeIssues(parent, parentBounds, nodes, horizontalEdgeMode, frameId, settings));
  }

  nodes.forEach((node) => {
    const bounds = getBounds(node);
    const edges: Record<Edge, EdgeSpacing> = {
      left: {
        edge: "left",
        value: normalizeDimension(bounds.x - parentBounds.x),
        label: "左"
      },
      right: {
        edge: "right",
        value: normalizeDimension(parentBounds.x + parentBounds.width - (bounds.x + bounds.width)),
        label: "右"
      },
      top: {
        edge: "top",
        value: normalizeDimension(bounds.y - parentBounds.y),
        label: "上"
      },
      bottom: {
        edge: "bottom",
        value: normalizeDimension(parentBounds.y + parentBounds.height - (bounds.y + bounds.height)),
        label: "下"
      }
    };

    if (horizontalEdgeMode === "pair-check") {
      issues.push(...createEdgePairIssues(node, parent, edges.left, edges.right, "horizontal", frameId, settings));
    }

    issues.push(...createEdgePairIssues(node, parent, edges.top, edges.bottom, "vertical", frameId, settings));
  });

  return issues;
}

function analyzeIconButtonPadding(
  parent: InspectableParentNode,
  parentBounds: Rect,
  node: MeasurableSceneNode,
  frameId: string
): SpacingIssue[] {
  const bounds = getBounds(node);
  const edges: Record<Edge, EdgeSpacing> = {
    left: {
      edge: "left",
      value: normalizeDimension(bounds.x - parentBounds.x),
      label: "左"
    },
    right: {
      edge: "right",
      value: normalizeDimension(parentBounds.x + parentBounds.width - (bounds.x + bounds.width)),
      label: "右"
    },
    top: {
      edge: "top",
      value: normalizeDimension(bounds.y - parentBounds.y),
      label: "上"
    },
    bottom: {
      edge: "bottom",
      value: normalizeDimension(parentBounds.y + parentBounds.height - (bounds.y + bounds.height)),
      label: "下"
    }
  };
  const childCenterX = bounds.x + bounds.width / 2;
  const childCenterY = bounds.y + bounds.height / 2;
  const parentCenterX = parentBounds.x + parentBounds.width / 2;
  const parentCenterY = parentBounds.y + parentBounds.height / 2;
  const isHorizontallyCentered =
    Math.abs(edges.left.value - edges.right.value) <= BUTTON_PADDING_SYMMETRY_TOLERANCE &&
    Math.abs(childCenterX - parentCenterX) <= BUTTON_CENTER_TOLERANCE;
  const isVerticallyCentered =
    Math.abs(edges.top.value - edges.bottom.value) <= BUTTON_PADDING_SYMMETRY_TOLERANCE &&
    Math.abs(childCenterY - parentCenterY) <= BUTTON_CENTER_TOLERANCE;
  const issues: SpacingIssue[] = [];

  if (!isHorizontallyCentered) {
    issues.push(createEdgeMismatchIssue(node, parent, edges.left, edges.right, "horizontal", frameId));
  }

  if (!isVerticallyCentered) {
    issues.push(createEdgeMismatchIssue(node, parent, edges.top, edges.bottom, "vertical", frameId));
  }

  return issues;
}

function isIconButtonLikeContainer(
  parent: InspectableParentNode,
  parentBounds: Rect,
  nodes: MeasurableSceneNode[]
): boolean {
  if (nodes.length !== 1) {
    return false;
  }

  if (parentBounds.width <= 0 || parentBounds.height <= 0) {
    return false;
  }

  return isNearlySquare(parentBounds) || hasCapsuleLikeRadius(parent, parentBounds);
}

function analyzeIconButtonClusterPadding(
  parent: InspectableParentNode,
  state: IconButtonPaddingState,
  frameId: string
): SpacingIssue[] {
  const issues: SpacingIssue[] = [];

  if (!state.isHorizontallyCentered) {
    issues.push(createEdgeMismatchIssue(state.representativeNode, parent, state.edges.left, state.edges.right, "horizontal", frameId));
  }

  if (!state.isVerticallyCentered) {
    issues.push(createEdgeMismatchIssue(state.representativeNode, parent, state.edges.top, state.edges.bottom, "vertical", frameId));
  }

  return issues;
}

function getIconButtonPaddingState(
  parent: InspectableParentNode,
  parentBounds: Rect,
  nodes: MeasurableSceneNode[]
): IconButtonPaddingState | null {
  if (!isIconButtonLikeShape(parent, parentBounds)) {
    return null;
  }

  const mainNodes = getMainIconButtonChildren(nodes, parentBounds);

  if (!mainNodes.length) {
    return null;
  }

  const contentBounds = getCombinedBounds(mainNodes);
  const edges = createEdgeSpacingFromBounds(contentBounds, parentBounds);
  const contentCenterX = contentBounds.x + contentBounds.width / 2;
  const contentCenterY = contentBounds.y + contentBounds.height / 2;
  const parentCenterX = parentBounds.x + parentBounds.width / 2;
  const parentCenterY = parentBounds.y + parentBounds.height / 2;

  return {
    representativeNode: mainNodes[0],
    edges,
    isHorizontallyCentered:
      Math.abs(edges.left.value - edges.right.value) <= BUTTON_PADDING_SYMMETRY_TOLERANCE &&
      Math.abs(contentCenterX - parentCenterX) <= BUTTON_CENTER_TOLERANCE,
    isVerticallyCentered:
      Math.abs(edges.top.value - edges.bottom.value) <= BUTTON_PADDING_SYMMETRY_TOLERANCE &&
      Math.abs(contentCenterY - parentCenterY) <= BUTTON_CENTER_TOLERANCE
  };
}

function isIconButtonLikeShape(parent: InspectableParentNode, parentBounds: Rect): boolean {
  if (parentBounds.width <= 0 || parentBounds.height <= 0) {
    return false;
  }

  return isNearlySquare(parentBounds) || hasCapsuleLikeRadius(parent, parentBounds);
}

function getMainIconButtonChildren(
  nodes: MeasurableSceneNode[],
  parentBounds: Rect
): MeasurableSceneNode[] {
  if (!nodes.length) {
    return [];
  }

  if (nodes.length === 1) {
    return nodes;
  }

  if (nodes.length > ICON_CLUSTER_MAX_CHILDREN) {
    return [];
  }

  const contentBounds = getCombinedBounds(nodes);
  const isCompactIconCluster =
    contentBounds.width <= parentBounds.width * ICON_CLUSTER_MAX_SIZE_RATIO &&
    contentBounds.height <= parentBounds.height * ICON_CLUSTER_MAX_SIZE_RATIO;

  return isCompactIconCluster ? nodes : [];
}

function getCombinedBounds(nodes: MeasurableSceneNode[]): Rect {
  const minX = Math.min(...nodes.map((node) => getBounds(node).x));
  const minY = Math.min(...nodes.map((node) => getBounds(node).y));
  const maxX = Math.max(...nodes.map((node) => {
    const bounds = getBounds(node);
    return bounds.x + bounds.width;
  }));
  const maxY = Math.max(...nodes.map((node) => {
    const bounds = getBounds(node);
    return bounds.y + bounds.height;
  }));

  return {
    x: minX,
    y: minY,
    width: normalizeDimension(maxX - minX),
    height: normalizeDimension(maxY - minY)
  };
}

function createEdgeSpacingFromBounds(bounds: Rect, parentBounds: Rect): Record<Edge, EdgeSpacing> {
  return {
    left: {
      edge: "left",
      value: normalizeDimension(bounds.x - parentBounds.x),
      label: "左"
    },
    right: {
      edge: "right",
      value: normalizeDimension(parentBounds.x + parentBounds.width - (bounds.x + bounds.width)),
      label: "右"
    },
    top: {
      edge: "top",
      value: normalizeDimension(bounds.y - parentBounds.y),
      label: "上"
    },
    bottom: {
      edge: "bottom",
      value: normalizeDimension(parentBounds.y + parentBounds.height - (bounds.y + bounds.height)),
      label: "下"
    }
  };
}

function isNearlySquare(bounds: Rect): boolean {
  return Math.abs(bounds.width - bounds.height) <= BUTTON_SHAPE_TOLERANCE;
}

function hasCapsuleLikeRadius(node: SceneNode, bounds: Rect): boolean {
  const radius = readUniformCornerRadius(node);

  if (radius === null) {
    return false;
  }

  return Math.abs(radius - Math.min(bounds.width, bounds.height) / 2) <= BUTTON_RADIUS_TOLERANCE;
}

function readUniformCornerRadius(node: SceneNode): number | null {
  if (!("cornerRadius" in node)) {
    return null;
  }

  const radius = (node as SceneNode & { cornerRadius: unknown }).cornerRadius;

  return typeof radius === "number" ? radius : null;
}

function createHorizontalEdgeIssues(
  parent: InspectableParentNode,
  parentBounds: Rect,
  nodes: MeasurableSceneNode[],
  mode: HorizontalEdgeMode,
  frameId: string,
  settings: QaSettings
): SpacingIssue[] {
  const contentEdges = getHorizontalContentEdges(parentBounds, nodes);

  if (!contentEdges) {
    return [];
  }

  if (mode === "left-only") {
    const multipleInfo = getSpacingMultipleInfo(contentEdges.left.value, settings);

    if (!shouldCheckSpacing(contentEdges.left.value) || multipleInfo.isValid) {
      return [];
    }

    return [createSingleEdgeMultipleIssue(contentEdges.leftNode, parent, contentEdges.left, "horizontal", multipleInfo, frameId, settings)];
  }

  if (mode === "right-only") {
    const multipleInfo = getSpacingMultipleInfo(contentEdges.right.value, settings);

    if (!shouldCheckSpacing(contentEdges.right.value) || multipleInfo.isValid) {
      return [];
    }

    return [createSingleEdgeMultipleIssue(contentEdges.rightNode, parent, contentEdges.right, "horizontal", multipleInfo, frameId, settings)];
  }

  if (
    shouldCheckSpacing(contentEdges.left.value) &&
    shouldCheckSpacing(contentEdges.right.value) &&
    isClearlyAsymmetric(contentEdges.left.value, contentEdges.right.value, settings)
  ) {
    return [
      createEdgeMismatchIssue(
        contentEdges.leftNode,
        parent,
        contentEdges.left,
        contentEdges.right,
        "horizontal",
        frameId
      )
    ];
  }

  return [];
}

function createGapIssue(
  firstNode: MeasurableSceneNode,
  secondNode: MeasurableSceneNode,
  gap: number,
  direction: Direction,
  frameId: string,
  settings: QaSettings
): SpacingIssue | null {
  const multipleInfo = getSpacingMultipleInfo(gap, settings);

  if (multipleInfo.isValid) {
    return null;
  }

  const currentValue = `${gap}px`;
  const layerName = `${firstNode.name} / ${secondNode.name}`;

  return {
    id: `spacing-not-multiple-${direction}-${firstNode.id}-${secondNode.id}-${currentValue}`,
    stableId: createSpacingIgnoreKey("spacing-not-multiple", frameId, firstNode.id, secondNode.id, direction),
    ignoreKey: createSpacingIgnoreKey("spacing-not-multiple", frameId, firstNode.id, secondNode.id, direction),
    ignoreKeyAliases: createSpacingIgnoreKeyAliases("spacing-not-multiple", frameId, currentValue, firstNode.id),
    type: "spacing-not-multiple",
    title: "间距疑似不规整",
    severity: "warning",
    layerId: firstNode.id,
    layerName,
    relatedLayerId: secondNode.id,
    relatedLayerName: secondNode.name,
    currentValue,
    suggestion: `当前基础间距单位为 ${settings.spacingBaseUnit}px，建议确认是否符合团队规范`,
    detail: `该${direction === "vertical" ? "垂直" : "水平"}相邻间距为 ${gap}px，建议确认是否调整为 ${multipleInfo.suggestions}。`,
    direction
  };
}

function createEdgePairIssues(
  node: MeasurableSceneNode,
  parent: InspectableParentNode,
  firstEdge: EdgeSpacing,
  secondEdge: EdgeSpacing,
  edgePair: EdgePair,
  frameId: string,
  settings: QaSettings
): SpacingIssue[] {
  const firstInRange = shouldCheckSpacing(firstEdge.value);
  const secondInRange = shouldCheckSpacing(secondEdge.value);

  if (!firstInRange && !secondInRange) {
    return [];
  }

  if (firstInRange && secondInRange) {
    const firstInfo = getSpacingMultipleInfo(firstEdge.value, settings);
    const secondInfo = getSpacingMultipleInfo(secondEdge.value, settings);

    if (!firstInfo.isValid || !secondInfo.isValid) {
      return [
        createEdgePairMultipleIssue(node, parent, firstEdge, secondEdge, firstInfo, secondInfo, edgePair, frameId, settings)
      ];
    }

    if (Math.abs(firstEdge.value - secondEdge.value) > Math.max(settings.spacingBaseUnit, settings.spacingTolerance)) {
      return [createEdgeMismatchIssue(node, parent, firstEdge, secondEdge, edgePair, frameId)];
    }

    return [];
  }

  const edge = firstInRange ? firstEdge : secondEdge;
  const multipleInfo = getSpacingMultipleInfo(edge.value, settings);

  if (multipleInfo.isValid) {
    return [];
  }

  return [createSingleEdgeMultipleIssue(node, parent, edge, edgePair, multipleInfo, frameId, settings)];
}

function createEdgePairMultipleIssue(
  node: MeasurableSceneNode,
  parent: InspectableParentNode,
  firstEdge: EdgeSpacing,
  secondEdge: EdgeSpacing,
  firstInfo: SpacingMultipleInfo,
  secondInfo: SpacingMultipleInfo,
  edgePair: EdgePair,
  frameId: string,
  settings: QaSettings
): SpacingIssue {
  const currentValue = `${firstEdge.label} ${firstEdge.value}px / ${secondEdge.label} ${secondEdge.value}px`;

  return {
    id: `spacing-edge-not-multiple-${edgePair}-${node.id}-${currentValue}`,
    stableId: createSpacingIgnoreKey("spacing-edge-not-multiple", frameId, node.id, edgePair),
    ignoreKey: createSpacingIgnoreKey("spacing-edge-not-multiple", frameId, node.id, edgePair),
    type: "spacing-edge-not-multiple",
    title: `${edgePair === "horizontal" ? "左右" : "上下"}边距不符合 ${settings.spacingBaseUnit}px 倍数`,
    severity: "warning",
    layerId: node.id,
    layerName: `${node.name} / 父级：${parent.name}`,
    currentValue,
    suggestion: `${firstEdge.label}侧建议调整为 ${firstInfo.suggestions}，${secondEdge.label}侧建议调整为 ${secondInfo.suggestions}`,
    detail: `当前基础间距单位为 ${settings.spacingBaseUnit}px，${firstEdge.label}${firstEdge.value}px，${secondEdge.label}${secondEdge.value}px，建议确认是否符合团队规范。`,
    direction: edgePair,
    edge: edgePair
  };
}

function createSingleEdgeMultipleIssue(
  node: MeasurableSceneNode,
  parent: InspectableParentNode,
  edge: EdgeSpacing,
  edgePair: EdgePair,
  multipleInfo: SpacingMultipleInfo,
  frameId: string,
  settings: QaSettings
): SpacingIssue {
  const currentValue = `${edge.label} ${edge.value}px`;

  return {
    id: `spacing-edge-not-multiple-${edge.edge}-${node.id}-${currentValue}`,
    stableId: createSpacingIgnoreKey("spacing-edge-not-multiple", frameId, node.id, edge.edge),
    ignoreKey: createSpacingIgnoreKey("spacing-edge-not-multiple", frameId, node.id, edge.edge),
    type: "spacing-edge-not-multiple",
    title: `${edge.label}边距不符合 ${settings.spacingBaseUnit}px 倍数`,
    severity: "warning",
    layerId: node.id,
    layerName: `${node.name} / 父级：${parent.name}`,
    currentValue,
    suggestion: `${edge.label}侧建议调整为 ${multipleInfo.suggestions}`,
    detail: `当前基础间距单位为 ${settings.spacingBaseUnit}px，${edge.label}侧边距为 ${edge.value}px，建议确认是否符合团队规范。`,
    direction: edgePair,
    edge: edge.edge
  };
}

function createEdgeMismatchIssue(
  node: MeasurableSceneNode,
  parent: InspectableParentNode,
  firstEdge: EdgeSpacing,
  secondEdge: EdgeSpacing,
  edgePair: EdgePair,
  frameId: string
): SpacingIssue {
  const currentValue = `${firstEdge.label} ${firstEdge.value}px / ${secondEdge.label} ${secondEdge.value}px`;

  return {
    id: `spacing-edge-mismatch-${edgePair}-${node.id}-${currentValue}`,
    stableId: createSpacingIgnoreKey("spacing-edge-mismatch", frameId, node.id, edgePair),
    ignoreKey: createSpacingIgnoreKey("spacing-edge-mismatch", frameId, node.id, edgePair),
    type: "spacing-edge-mismatch",
    title: `${edgePair === "horizontal" ? "左右" : "上下"}边距疑似不一致`,
    severity: "warning",
    layerId: node.id,
    layerName: `${node.name} / 父级：${parent.name}`,
    currentValue,
    suggestion: `建议确认${edgePair === "horizontal" ? "左右" : "上下"}边距是否需要保持一致`,
    detail: `${firstEdge.label}侧边距为 ${firstEdge.value}px，${secondEdge.label}侧边距为 ${secondEdge.value}px。若该节点是主要内容容器，建议确认两侧边距关系。`,
    direction: edgePair,
    edge: edgePair
  };
}

function getHorizontalEdgeMode(
  parent: InspectableParentNode,
  parentBounds: Rect,
  nodes: MeasurableSceneNode[]
): HorizontalEdgeMode {
  const layoutMode = readAutoLayoutValue(parent, "layoutMode");

  if (layoutMode === "HORIZONTAL") {
    return getAlignmentEdgeMode(readAutoLayoutValue(parent, "primaryAxisAlignItems"));
  }

  if (layoutMode === "VERTICAL") {
    return getAlignmentEdgeMode(readAutoLayoutValue(parent, "counterAxisAlignItems"));
  }

  return inferHorizontalEdgeMode(parentBounds, nodes);
}

function getAlignmentEdgeMode(alignment: string): HorizontalEdgeMode {
  if (alignment === "MIN") {
    return "left-only";
  }

  if (alignment === "MAX") {
    return "right-only";
  }

  if (alignment === "CENTER") {
    return "center-mismatch-only";
  }

  return "skip";
}

function readAutoLayoutValue(node: SceneNode, key: "layoutMode" | "primaryAxisAlignItems" | "counterAxisAlignItems"): string {
  if (!(key in node)) {
    return "";
  }

  const value = (node as SceneNode & Record<typeof key, unknown>)[key];

  return typeof value === "string" ? value : "";
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

function shouldCheckSpacing(value: number): boolean {
  return value >= MIN_SPACING_TO_CHECK && value <= MAX_SPACING_TO_CHECK;
}

function getSpacingMultipleInfo(value: number, settings: QaSettings): SpacingMultipleInfo {
  const baseUnit = Math.max(1, settings.spacingBaseUnit || DEFAULT_QA_SETTINGS.spacingBaseUnit);
  const nearestLower = Math.floor(value / baseUnit) * baseUnit;
  const nearestUpper = Math.ceil(value / baseUnit) * baseUnit;
  const nearestValue = Math.abs(value - nearestLower) <= Math.abs(value - nearestUpper) ? nearestLower : nearestUpper;
  const effectiveTolerance = baseUnit === 2 ? 0 : settings.spacingTolerance;

  return {
    isValid: Math.abs(value - nearestValue) <= effectiveTolerance,
    suggestions: formatSuggestedValues(nearestLower, nearestUpper)
  };
}

function getHorizontalContentEdges(parentBounds: Rect, nodes: MeasurableSceneNode[]): HorizontalContentEdges | null {
  if (!nodes.length) {
    return null;
  }

  let leftNode = nodes[0];
  let rightNode = nodes[0];
  let leftValue = getBounds(leftNode).x;
  let rightValue = getBounds(rightNode).x + getBounds(rightNode).width;

  nodes.forEach((node) => {
    const bounds = getBounds(node);
    const nodeLeft = bounds.x;
    const nodeRight = bounds.x + bounds.width;

    if (nodeLeft < leftValue) {
      leftValue = nodeLeft;
      leftNode = node;
    }

    if (nodeRight > rightValue) {
      rightValue = nodeRight;
      rightNode = node;
    }
  });

  return {
    left: {
      edge: "left",
      value: normalizeDimension(leftValue - parentBounds.x),
      label: "左"
    },
    right: {
      edge: "right",
      value: normalizeDimension(parentBounds.x + parentBounds.width - rightValue),
      label: "右"
    },
    leftNode,
    rightNode
  };
}

function inferHorizontalEdgeMode(parentBounds: Rect, nodes: MeasurableSceneNode[]): HorizontalEdgeMode {
  const contentEdges = getHorizontalContentEdges(parentBounds, nodes);

  if (!contentEdges) {
    return "skip";
  }

  const groupCenterX = normalizeDimension(
    parentBounds.x + contentEdges.left.value + (parentBounds.width - contentEdges.left.value - contentEdges.right.value) / 2
  );
  const parentCenterX = normalizeDimension(parentBounds.x + parentBounds.width / 2);

  if (Math.abs(groupCenterX - parentCenterX) <= CENTER_ALIGNMENT_TOLERANCE) {
    return "center-mismatch-only";
  }

  if (nodes.length === 1) {
    if (contentEdges.left.value < contentEdges.right.value) {
      return "left-only";
    }

    if (contentEdges.right.value < contentEdges.left.value) {
      return "right-only";
    }
  }

  if (hasMajorityAlignedEdge(nodes, "left")) {
    return "left-only";
  }

  if (hasMajorityAlignedEdge(nodes, "right")) {
    return "right-only";
  }

  return "skip";
}

function hasMajorityAlignedEdge(nodes: MeasurableSceneNode[], edge: "left" | "right"): boolean {
  if (nodes.length < 2) {
    return false;
  }

  const values = nodes.map((node) => {
    const bounds = getBounds(node);
    return edge === "left" ? bounds.x : bounds.x + bounds.width;
  });
  const alignedCount = values.filter((value) => {
    const nearbyValues = values.filter((candidate) => Math.abs(candidate - value) <= EDGE_ALIGNMENT_TOLERANCE);
    return nearbyValues.length / values.length >= EDGE_ALIGNMENT_RATIO;
  }).length;

  return alignedCount / values.length >= EDGE_ALIGNMENT_RATIO;
}

function isClearlyAsymmetric(first: number, second: number, settings: QaSettings): boolean {
  const threshold = Math.max(settings.spacingBaseUnit * 2, settings.spacingTolerance);

  return Math.abs(first - second) > threshold;
}

function formatSuggestedValues(nearestLower: number, nearestUpper: number): string {
  if (nearestLower === nearestUpper) {
    return `${nearestLower}px`;
  }

  return `${nearestLower}px 或 ${nearestUpper}px`;
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return Math.min(endA, endB) - Math.max(startA, startB) > 0;
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

function createSpacingIgnoreKey(
  type: SpacingIssueType,
  frameId: string,
  layerId: string,
  relatedIdOrEdge?: string,
  direction?: Direction
): string {
  return [type, frameId, layerId, relatedIdOrEdge || "", direction || ""]
    .filter(Boolean)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .join("::");
}

function createSpacingIgnoreKeyAliases(
  type: SpacingIssueType,
  frameId: string,
  currentValue: string,
  layerId: string
): string[] {
  return [
    [type, frameId, layerId, currentValue].map((part) => part.replace(/\s+/g, " ").trim()).join("::"),
    [type, layerId, currentValue, frameId].map((part) => part.replace(/\s+/g, " ").trim()).join("::")
  ];
}

function dedupeSpacingIssues(issues: SpacingIssue[]): SpacingIssue[] {
  const seenKeys = new Set<string>();
  const results: SpacingIssue[] = [];

  issues.forEach((issue) => {
    if (seenKeys.has(issue.id)) {
      return;
    }

    seenKeys.add(issue.id);
    results.push(issue);
  });

  return results;
}
