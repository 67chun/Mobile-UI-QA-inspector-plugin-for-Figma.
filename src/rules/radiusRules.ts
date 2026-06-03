import type { RadiusIssue, RadiusIssueType } from "../types";
import { collectInspectableDescendants, normalizeDimension } from "../utils/nodeUtils";

const BACKGROUND_SIZE_TOLERANCE = 2;
const SIMILAR_SIZE_RATIO = 0.15;
const RADIUS_DIFF_THRESHOLD = 2;
const NESTING_TOLERANCE = 1;
const MAX_NESTING_GAP = 40;
const CAPSULE_TOLERANCE = 1;

type ParentSceneNode = SceneNode & {
  children: readonly SceneNode[];
};

type RadiusNodeInfo = {
  node: SceneNode;
  id: string;
  name: string;
  parentId: string;
  bounds: Rect;
  radius: number;
  isCapsule: boolean;
  nameKey: string;
};

export function analyzeRadiusIssues(frame: FrameNode): RadiusIssue[] {
  const radiusNodes = getRadiusNodes(frame);
  const issues = [
    ...analyzeSiblingRadiusConsistency(radiusNodes, frame.id),
    ...analyzeNestedRadiusRelationship(radiusNodes, frame.id)
  ];

  return dedupeRadiusIssues(issues);
}

function analyzeSiblingRadiusConsistency(nodes: RadiusNodeInfo[], frameId: string): RadiusIssue[] {
  const issues: RadiusIssue[] = [];
  const groups = new Map<string, RadiusNodeInfo[]>();

  nodes.forEach((info) => {
    const groupKey = `${info.parentId}::${info.isCapsule ? "capsule" : "normal"}::${info.nameKey}`;
    const group = groups.get(groupKey) || [];
    group.push(info);
    groups.set(groupKey, group);
  });

  groups.forEach((group) => {
    for (let firstIndex = 0; firstIndex < group.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < group.length; secondIndex += 1) {
        const first = group[firstIndex];
        const second = group[secondIndex];

        if (!areSimilarSize(first, second)) {
          continue;
        }

        const radiusDiff = Math.abs(first.radius - second.radius);

        if (radiusDiff <= RADIUS_DIFF_THRESHOLD) {
          continue;
        }

        const currentValue = `${first.radius}px / ${second.radius}px`;
        issues.push({
          id: `radius-inconsistent-${first.id}-${second.id}-${currentValue}`,
          stableId: createRadiusIgnoreKey("radius-inconsistent", frameId, first.id, second.id),
          ignoreKey: createRadiusIgnoreKey("radius-inconsistent", frameId, first.id, second.id),
          ignoreKeyAliases: createRadiusIgnoreKeyAliases("radius-inconsistent", frameId, currentValue, first.id),
          type: "radius-inconsistent",
          title: "圆角关系疑似不一致",
          severity: "warning",
          layerId: first.id,
          layerName: `${first.name} / ${second.name}`,
          relatedLayerId: second.id,
          relatedLayerName: second.name,
          currentValue,
          suggestion: "建议确认同类组件圆角是否统一",
          detail: `这两个同父级节点名称或尺寸较相似，但圆角分别为 ${first.radius}px 和 ${second.radius}px。胶囊组件已单独分组，不与普通圆角组件混比。`
        });
      }
    }
  });

  return issues;
}

function analyzeNestedRadiusRelationship(nodes: RadiusNodeInfo[], frameId: string): RadiusIssue[] {
  const issues: RadiusIssue[] = [];

  nodes.forEach((outer) => {
    nodes.forEach((inner) => {
      if (outer.id === inner.id || !isInside(outer.bounds, inner.bounds)) {
        return;
      }

      if (outer.isCapsule || inner.isCapsule) {
        return;
      }

      const inset = getMinimumInset(outer.bounds, inner.bounds);

      if (inset <= 0 || inset > MAX_NESTING_GAP) {
        return;
      }

      const expectedInnerRadius = Math.max(0, normalizeDimension(outer.radius - inset));
      const diff = normalizeDimension(inner.radius - expectedInnerRadius);

      if (inner.radius > outer.radius + NESTING_TOLERANCE) {
        issues.push(createNestedIssue(outer, inner, inset, expectedInnerRadius, frameId, "内层圆角明显大于外层圆角"));
        return;
      }

      if (Math.abs(diff) > NESTING_TOLERANCE && inner.radius < expectedInnerRadius - NESTING_TOLERANCE) {
        issues.push(createNestedIssue(outer, inner, inset, expectedInnerRadius, frameId, "内外圆角关系疑似断裂"));
      }
    });
  });

  return issues;
}

function createNestedIssue(
  outer: RadiusNodeInfo,
  inner: RadiusNodeInfo,
  inset: number,
  expectedInnerRadius: number,
  frameId: string,
  title: string
): RadiusIssue {
  const currentValue = `外 ${outer.radius}px / 内 ${inner.radius}px / 间距 ${inset}px`;

  return {
    id: `radius-nesting-mismatch-${outer.id}-${inner.id}-${currentValue}`,
    stableId: createRadiusIgnoreKey("radius-nesting-mismatch", frameId, outer.id, inner.id),
    ignoreKey: createRadiusIgnoreKey("radius-nesting-mismatch", frameId, outer.id, inner.id),
    ignoreKeyAliases: createRadiusIgnoreKeyAliases("radius-nesting-mismatch", frameId, currentValue, outer.id),
    type: "radius-nesting-mismatch",
    title,
    severity: "warning",
    layerId: outer.id,
    layerName: `${outer.name} / ${inner.name}`,
    relatedLayerId: inner.id,
    relatedLayerName: inner.name,
    currentValue,
    suggestion: `建议确认内层圆角是否接近 ${expectedInnerRadius}px`,
    detail: `内外圆角常见关系为：内层圆角 ≈ 外层圆角 - 内外间距。当前外层圆角 ${outer.radius}px，内外间距约 ${inset}px，推算内层圆角约 ${expectedInnerRadius}px。`
  };
}

function getRadiusNodes(frame: FrameNode): RadiusNodeInfo[] {
  return collectInspectableDescendants(frame)
    .filter((node) => shouldCheckRadiusNode(node, frame))
    .map((node) => createRadiusNodeInfo(node as SceneNodeWithRadius))
    .filter((info): info is RadiusNodeInfo => Boolean(info));
}

type SceneNodeWithRadius = SceneNode & {
  width: number;
  height: number;
  cornerRadius: number | PluginAPI["mixed"];
  absoluteBoundingBox: Rect | null;
};

function shouldCheckRadiusNode(node: SceneNode, frame: FrameNode): boolean {
  if (node.type === "INSTANCE" || !node.visible || !("cornerRadius" in node) || !("width" in node) || !("height" in node)) {
    return false;
  }

  const candidate = node as SceneNodeWithRadius;
  const bounds = candidate.absoluteBoundingBox;

  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return false;
  }

  if (bounds.width >= frame.width - BACKGROUND_SIZE_TOLERANCE && bounds.height >= frame.height - BACKGROUND_SIZE_TOLERANCE) {
    return false;
  }

  if (candidate.cornerRadius === figma.mixed || candidate.cornerRadius <= 0) {
    return false;
  }

  return true;
}

function createRadiusNodeInfo(node: SceneNodeWithRadius): RadiusNodeInfo | null {
  const bounds = node.absoluteBoundingBox;

  if (!bounds || node.cornerRadius === figma.mixed) {
    return null;
  }

  const radius = normalizeDimension(node.cornerRadius);

  return {
    node,
    id: node.id,
    name: node.name,
    parentId: node.parent ? node.parent.id : "unknown-parent",
    bounds,
    radius,
    isCapsule: Math.abs(radius - bounds.height / 2) <= CAPSULE_TOLERANCE,
    nameKey: createNameKey(node.name)
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

function areSimilarSize(first: RadiusNodeInfo, second: RadiusNodeInfo): boolean {
  return (
    isSimilarNumber(first.bounds.width, second.bounds.width) &&
    isSimilarNumber(first.bounds.height, second.bounds.height)
  );
}

function isSimilarNumber(first: number, second: number): boolean {
  const max = Math.max(first, second);

  if (max === 0) {
    return false;
  }

  return Math.abs(first - second) / max <= SIMILAR_SIZE_RATIO;
}

function isInside(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function getMinimumInset(outer: Rect, inner: Rect): number {
  return normalizeDimension(
    Math.min(
      inner.x - outer.x,
      inner.y - outer.y,
      outer.x + outer.width - (inner.x + inner.width),
      outer.y + outer.height - (inner.y + inner.height)
    )
  );
}

function createRadiusIgnoreKey(
  type: RadiusIssueType,
  frameId: string,
  layerId: string,
  relatedLayerId?: string
): string {
  const parts = relatedLayerId ? [type, frameId, layerId, relatedLayerId] : [type, frameId, layerId];
  return parts.map((part) => part.replace(/\s+/g, " ").trim()).join("::");
}

function createRadiusIgnoreKeyAliases(
  type: RadiusIssueType,
  frameId: string,
  currentValue: string,
  layerId: string
): string[] {
  return [
    [type, frameId, layerId, currentValue].map((part) => part.replace(/\s+/g, " ").trim()).join("::"),
    [type, layerId, currentValue, frameId].map((part) => part.replace(/\s+/g, " ").trim()).join("::")
  ];
}

function dedupeRadiusIssues(issues: RadiusIssue[]): RadiusIssue[] {
  const seenKeys = new Set<string>();
  const results: RadiusIssue[] = [];

  issues.forEach((issue) => {
    if (seenKeys.has(issue.id)) {
      return;
    }

    seenKeys.add(issue.id);
    results.push(issue);
  });

  return results;
}
