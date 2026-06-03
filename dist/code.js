"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // src/utils/nodeUtils.ts
  function normalizeDimension(value) {
    return Number(value.toFixed(2));
  }
  function getChildrenCount(frame) {
    return frame.children.length;
  }
  function hasSceneChildren(node) {
    return "children" in node && Array.isArray(node.children);
  }
  function canScanChildren(node) {
    return node.type !== "INSTANCE" && hasSceneChildren(node) && (node.type === "FRAME" || node.type === "GROUP" || node.type === "SECTION" || node.type === "COMPONENT" || node.type === "COMPONENT_SET");
  }
  function collectInspectableDescendants(frame) {
    const results = [];
    frame.children.forEach((child) => {
      collectInspectableNode(child, results);
    });
    return results;
  }
  function collectInspectableParents(frame) {
    const parents = [frame];
    collectInspectableDescendants(frame).forEach((node) => {
      if (canScanChildren(node)) {
        parents.push(node);
      }
    });
    return parents;
  }
  function collectInspectableNode(node, results) {
    if (!node.visible) {
      return;
    }
    results.push(node);
    if (!canScanChildren(node)) {
      return;
    }
    node.children.forEach((child) => {
      collectInspectableNode(child, results);
    });
  }

  // src/utils/settingsUtils.ts
  var SETTINGS_STORAGE_KEY = "mobile-ui-qa-inspector-settings";
  var CURRENT_SETTINGS_VERSION = 2;
  var DEFAULT_QA_SETTINGS = {
    settingsVersion: CURRENT_SETTINGS_VERSION,
    frameWidth: 375,
    pageHorizontalMargin: 16,
    minTinyTextSize: 10,
    smallTextWarningSize: 12,
    bodyTextReferenceSize: 14,
    spacingBaseUnit: 2,
    spacingTolerance: 1
  };
  async function loadQaSettings() {
    try {
      const storedSettings = await figma.clientStorage.getAsync(SETTINGS_STORAGE_KEY);
      return normalizeQaSettings(storedSettings);
    } catch (e) {
      return __spreadValues({}, DEFAULT_QA_SETTINGS);
    }
  }
  async function saveQaSettings(settings) {
    const normalizedSettings = normalizeQaSettings(settings);
    await figma.clientStorage.setAsync(SETTINGS_STORAGE_KEY, normalizedSettings);
    return normalizedSettings;
  }
  async function resetQaSettings() {
    const defaultSettings = __spreadValues({}, DEFAULT_QA_SETTINGS);
    await figma.clientStorage.setAsync(SETTINGS_STORAGE_KEY, defaultSettings);
    return defaultSettings;
  }
  function normalizeQaSettings(settings) {
    const input = isSettingsLike(settings) ? settings : {};
    const minTinyTextSize = readPositiveNumber(input.minTinyTextSize, DEFAULT_QA_SETTINGS.minTinyTextSize);
    const smallTextWarningSize = Math.max(
      readPositiveNumber(input.smallTextWarningSize, DEFAULT_QA_SETTINGS.smallTextWarningSize),
      minTinyTextSize
    );
    const bodyTextReferenceSize = Math.max(
      readPositiveNumber(input.bodyTextReferenceSize, DEFAULT_QA_SETTINGS.bodyTextReferenceSize),
      smallTextWarningSize
    );
    return {
      settingsVersion: CURRENT_SETTINGS_VERSION,
      frameWidth: DEFAULT_QA_SETTINGS.frameWidth,
      pageHorizontalMargin: readPositiveNumber(
        input.pageHorizontalMargin,
        DEFAULT_QA_SETTINGS.pageHorizontalMargin
      ),
      minTinyTextSize,
      smallTextWarningSize,
      bodyTextReferenceSize,
      spacingBaseUnit: readSpacingBaseUnit(input),
      spacingTolerance: readNonNegativeNumber(input.spacingTolerance, DEFAULT_QA_SETTINGS.spacingTolerance)
    };
  }
  function isSettingsLike(value) {
    return typeof value === "object" && value !== null;
  }
  function readPositiveNumber(value, fallback) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue <= 0) {
      return fallback;
    }
    return numberValue;
  }
  function readSpacingBaseUnit(input) {
    const spacingBaseUnit = readPositiveNumber(input.spacingBaseUnit, DEFAULT_QA_SETTINGS.spacingBaseUnit);
    if (input.settingsVersion !== CURRENT_SETTINGS_VERSION && spacingBaseUnit === 4) {
      return DEFAULT_QA_SETTINGS.spacingBaseUnit;
    }
    return spacingBaseUnit;
  }
  function readNonNegativeNumber(value, fallback) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue < 0) {
      return fallback;
    }
    return numberValue;
  }

  // src/rules/alignmentRules.ts
  var BACKGROUND_SIZE_TOLERANCE = 2;
  var ALIGNMENT_TOLERANCE = 2;
  var BASE_ALIGNMENT_UNIT = 2;
  var MAX_NEARBY_GAP = 80;
  var SIMILAR_SIZE_RATIO = 0.15;
  var CENTER_ALIGNMENT_TOLERANCE = 4;
  var EDGE_ALIGNMENT_TOLERANCE = 2;
  var EDGE_ALIGNMENT_RATIO = 0.66;
  var FULL_BLEED_EDGE_TOLERANCE = 4;
  var CONTENT_MARGIN_TOLERANCE = 4;
  var WIDTH_BUCKET_SIZE = 16;
  var CUSTOM_EDGE_BUCKET_SIZE = 8;
  var LARGE_WIDTH_DIFFERENCE_RATIO = 0.35;
  function analyzeAlignmentIssues(frame, settings = DEFAULT_QA_SETTINGS) {
    const issues = [];
    const parents = collectInspectableParents(frame);
    parents.forEach((parent) => {
      const parentBounds = getParentBounds(parent);
      if (!parentBounds || isAutoLayoutParent(parent)) {
        return;
      }
      const nodes = parent.children.filter((node) => shouldCheckNode(node, parentBounds)).map((node) => createAlignmentNodeInfo(node));
      const horizontalLayout = inferHorizontalLayout(parentBounds, nodes);
      if (horizontalLayout === "left") {
        issues.push(...analyzeLeftAlignment(nodes, parentBounds, frame.id, settings));
      }
      issues.push(...analyzeVerticalCenterAlignment(nodes, frame.id));
      issues.push(...analyzeSimilarNodeAlignment(nodes, parentBounds, frame.id, settings));
    });
    return dedupeAlignmentIssues(issues);
  }
  function analyzeLeftAlignment(nodes, parentBounds, frameId, settings) {
    const issues = [];
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
          title: "\u5DE6\u5BF9\u9F50\u7591\u4F3C\u4E0D\u4E00\u81F4",
          currentValue: `x \u5DEE ${offset}px`,
          suggestion: "\u5EFA\u8BAE\u786E\u8BA4\u540C\u7EC4\u5143\u7D20\u5DE6\u8FB9\u7F18\u662F\u5426\u9700\u8981\u7EDF\u4E00",
          detail: `${first.name} \u4E0E ${second.name} \u5728\u540C\u4E00\u7236\u7EA7\u4E0B\u4F4D\u7F6E\u63A5\u8FD1\uFF0C\u4F46\u5DE6\u8FB9\u7F18\u76F8\u5DEE ${offset}px\u3002`,
          direction: "horizontal"
        }));
      }
    });
    return issues;
  }
  function analyzeVerticalCenterAlignment(nodes, frameId) {
    const issues = [];
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
        title: "\u5782\u76F4\u4E2D\u5FC3\u7591\u4F3C\u9519\u4F4D",
        currentValue: `\u4E2D\u5FC3\u7EBF\u5DEE ${offset}px`,
        suggestion: "\u5EFA\u8BAE\u786E\u8BA4\u56FE\u6807\u3001\u6587\u5B57\u6216\u6309\u94AE\u5185\u5BB9\u662F\u5426\u9700\u8981\u5782\u76F4\u5C45\u4E2D",
        detail: `${first.name} \u4E0E ${second.name} \u6A2A\u5411\u76F8\u90BB\uFF0C\u4F46\u5782\u76F4\u4E2D\u5FC3\u7EBF\u76F8\u5DEE ${offset}px\u3002`,
        direction: "vertical"
      }));
    }
    return issues;
  }
  function analyzeSimilarNodeAlignment(nodes, parentBounds, frameId, settings) {
    const issues = [];
    const sortedByX = [...nodes].sort((a, b) => a.bounds.x - b.bounds.x);
    const sortedByY = [...nodes].sort((a, b) => a.bounds.y - b.bounds.y);
    for (let index = 0; index < sortedByX.length - 1; index += 1) {
      const first = sortedByX[index];
      const second = sortedByX[index + 1];
      if (!areComparableSimilarNodes(first, second, parentBounds, settings) || !rangesOverlap(first.bounds.y, first.bounds.y + first.bounds.height, second.bounds.y, second.bounds.y + second.bounds.height) || getHorizontalGap(first.bounds, second.bounds) > MAX_NEARBY_GAP) {
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
        title: "\u540C\u7C7B\u5143\u7D20\u5BF9\u9F50\u7591\u4F3C\u4E0D\u4E00\u81F4",
        currentValue: `y \u5DEE ${offset}px`,
        suggestion: "\u5EFA\u8BAE\u786E\u8BA4\u540C\u4E00\u884C\u540C\u7C7B\u5361\u7247\u6216\u6309\u94AE\u7684\u9876\u90E8\u662F\u5426\u5BF9\u9F50",
        detail: `${first.name} \u4E0E ${second.name} \u5C3A\u5BF8\u6216\u540D\u79F0\u76F8\u8FD1\uFF0C\u4F46\u9876\u90E8 y \u503C\u76F8\u5DEE ${offset}px\u3002`,
        direction: "vertical"
      }));
    }
    for (let index = 0; index < sortedByY.length - 1; index += 1) {
      const first = sortedByY[index];
      const second = sortedByY[index + 1];
      if (!areComparableSimilarNodes(first, second, parentBounds, settings) || !rangesOverlap(first.bounds.x, first.bounds.x + first.bounds.width, second.bounds.x, second.bounds.x + second.bounds.width) || getVerticalGap(first.bounds, second.bounds) > MAX_NEARBY_GAP) {
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
        title: "\u540C\u7C7B\u5143\u7D20\u5BF9\u9F50\u7591\u4F3C\u4E0D\u4E00\u81F4",
        currentValue: `x \u5DEE ${offset}px`,
        suggestion: "\u5EFA\u8BAE\u786E\u8BA4\u540C\u4E00\u5217\u540C\u7C7B\u5361\u7247\u6216\u6309\u94AE\u7684\u5DE6\u8FB9\u7F18\u662F\u5426\u5BF9\u9F50",
        detail: `${first.name} \u4E0E ${second.name} \u5C3A\u5BF8\u6216\u540D\u79F0\u76F8\u8FD1\uFF0C\u4F46\u5DE6\u4FA7 x \u503C\u76F8\u5DEE ${offset}px\u3002`,
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
  }) {
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
  function shouldCheckNode(node, parentBounds) {
    if (!node.visible || !isMeasurableNode(node)) {
      return false;
    }
    const bounds = node.absoluteBoundingBox;
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      return false;
    }
    if (bounds.width >= parentBounds.width - BACKGROUND_SIZE_TOLERANCE && bounds.height >= parentBounds.height - BACKGROUND_SIZE_TOLERANCE) {
      return false;
    }
    return true;
  }
  function isMeasurableNode(node) {
    return "width" in node && "height" in node && "absoluteBoundingBox" in node;
  }
  function createAlignmentNodeInfo(node) {
    return {
      node,
      id: node.id,
      name: node.name,
      bounds: getBounds(node),
      nameKey: createNameKey(node.name)
    };
  }
  function isAutoLayoutParent(parent) {
    const layoutMode = readAutoLayoutValue(parent, "layoutMode");
    return layoutMode === "HORIZONTAL" || layoutMode === "VERTICAL";
  }
  function inferHorizontalLayout(parentBounds, nodes) {
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
  function getContentBounds(nodes) {
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
  function hasMajorityAlignedEdge(nodes, edge) {
    const values = nodes.map((node) => edge === "left" ? node.bounds.x : node.bounds.x + node.bounds.width);
    const largestGroupSize = values.reduce((maxGroupSize, value) => {
      const groupSize = values.filter((candidate) => Math.abs(candidate - value) <= EDGE_ALIGNMENT_TOLERANCE).length;
      return Math.max(maxGroupSize, groupSize);
    }, 0);
    return largestGroupSize / values.length >= EDGE_ALIGNMENT_RATIO;
  }
  function readAutoLayoutValue(node, key) {
    if (!(key in node)) {
      return "";
    }
    const value = node[key];
    return typeof value === "string" ? value : "";
  }
  function isNearbyVerticalPair(first, second) {
    if (rangesOverlap(first.y, first.y + first.height, second.y, second.y + second.height)) {
      return false;
    }
    if (!rangesOverlap(first.x, first.x + first.width, second.x, second.x + second.width)) {
      return false;
    }
    const gap = Math.max(0, second.y - (first.y + first.height), first.y - (second.y + second.height));
    return gap <= MAX_NEARBY_GAP;
  }
  function isNearbyHorizontalPair(first, second) {
    if (!rangesOverlap(first.y, first.y + first.height, second.y, second.y + second.height)) {
      return false;
    }
    const gap = Math.max(0, second.x - (first.x + first.width), first.x - (second.x + second.width));
    return gap <= MAX_NEARBY_GAP;
  }
  function getHorizontalGap(first, second) {
    return Math.max(0, second.x - (first.x + first.width), first.x - (second.x + second.width));
  }
  function getVerticalGap(first, second) {
    return Math.max(0, second.y - (first.y + first.height), first.y - (second.y + second.height));
  }
  function isLikelyInlinePair(first, second) {
    return Math.min(first.height, second.height) <= 32 || Math.max(first.height, second.height) <= 48;
  }
  function shouldReportOffset(offset) {
    return offset > ALIGNMENT_TOLERANCE || offset > 0 && offset % BASE_ALIGNMENT_UNIT !== 0;
  }
  function groupNodesByAlignmentFeature(nodes, parentBounds, settings) {
    const groups = /* @__PURE__ */ new Map();
    nodes.forEach((node) => {
      const feature = createAlignmentFeature(node, parentBounds, settings);
      const group = groups.get(feature.groupKey) || [];
      group.push(node);
      groups.set(feature.groupKey, group);
    });
    return Array.from(groups.values()).filter((group) => group.length > 1);
  }
  function createAlignmentFeature(node, parentBounds, settings) {
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
  function isFullBleedLikeNode(node, parentBounds, settings) {
    const edges = getRelativeEdges(node.bounds, parentBounds);
    const contentMargin = getSafeContentMargin(settings);
    const widthRatio = node.bounds.width / parentBounds.width;
    const nearParentEdge = edges.left <= FULL_BLEED_EDGE_TOLERANCE || edges.right <= FULL_BLEED_EDGE_TOLERANCE;
    const nearFullWidth = node.bounds.width >= parentBounds.width - Math.max(contentMargin, FULL_BLEED_EDGE_TOLERANCE * 2);
    const smallerThanContentMargins = edges.left < contentMargin * 0.75 && edges.right < contentMargin * 0.75;
    return nearFullWidth || nearParentEdge && widthRatio >= 0.65 || smallerThanContentMargins && widthRatio >= 0.8;
  }
  function getRelativeEdges(bounds, parentBounds) {
    return {
      left: normalizeDimension(bounds.x - parentBounds.x),
      right: normalizeDimension(parentBounds.x + parentBounds.width - (bounds.x + bounds.width))
    };
  }
  function getNearestContentMargin(left, settings) {
    const candidates = Array.from(/* @__PURE__ */ new Set([
      getSafeContentMargin(settings),
      12,
      16,
      24
    ])).sort((a, b) => a - b);
    const match = candidates.find((candidate) => Math.abs(left - candidate) <= CONTENT_MARGIN_TOLERANCE);
    return match != null ? match : null;
  }
  function getSafeContentMargin(settings) {
    return Math.max(1, settings.pageHorizontalMargin || DEFAULT_QA_SETTINGS.pageHorizontalMargin);
  }
  function createWidthKey(width, parentWidth) {
    const ratio = parentWidth > 0 ? width / parentWidth : 0;
    if (ratio >= 0.85) {
      return "wide";
    }
    if (ratio >= 0.45) {
      return `medium-${Math.round(width / WIDTH_BUCKET_SIZE)}`;
    }
    return `small-${Math.round(width / WIDTH_BUCKET_SIZE)}`;
  }
  function haveComparableWidth(first, second) {
    const max = Math.max(first.bounds.width, second.bounds.width);
    if (max === 0) {
      return false;
    }
    return Math.min(first.bounds.width, second.bounds.width) / max >= LARGE_WIDTH_DIFFERENCE_RATIO;
  }
  function areComparableSimilarNodes(first, second, parentBounds, settings) {
    const firstFeature = createAlignmentFeature(first, parentBounds, settings);
    const secondFeature = createAlignmentFeature(second, parentBounds, settings);
    if (firstFeature.isFullBleed !== secondFeature.isFullBleed || !haveComparableWidth(first, second)) {
      return false;
    }
    return first.nameKey === second.nameKey || isSimilarNumber(first.bounds.width, second.bounds.width) && isSimilarNumber(first.bounds.height, second.bounds.height);
  }
  function isSimilarNumber(first, second) {
    const max = Math.max(first, second);
    if (max === 0) {
      return false;
    }
    return Math.abs(first - second) / max <= SIMILAR_SIZE_RATIO;
  }
  function rangesOverlap(startA, endA, startB, endB) {
    return Math.min(endA, endB) - Math.max(startA, startB) > 0;
  }
  function getCenterY(bounds) {
    return normalizeDimension(bounds.y + bounds.height / 2);
  }
  function getParentBounds(parent) {
    if ("absoluteBoundingBox" in parent && parent.absoluteBoundingBox) {
      return parent.absoluteBoundingBox;
    }
    return null;
  }
  function getBounds(node) {
    return node.absoluteBoundingBox || {
      x: node.absoluteTransform[0][2],
      y: node.absoluteTransform[1][2],
      width: node.width,
      height: node.height
    };
  }
  function createNameKey(name) {
    return name.toLowerCase().replace(/\d+/g, "").replace(/[_\-#]/g, " ").replace(/\s+/g, " ").trim().slice(0, 24);
  }
  function createAlignmentStableId(type, frameId, firstNodeId, secondNodeId, direction) {
    return [type, frameId, firstNodeId, secondNodeId, direction].map((part) => part.replace(/\s+/g, " ").trim()).join("::");
  }
  function dedupeAlignmentIssues(issues) {
    const seenKeys = /* @__PURE__ */ new Set();
    const results = [];
    issues.forEach((issue) => {
      if (seenKeys.has(issue.stableId)) {
        return;
      }
      seenKeys.add(issue.stableId);
      results.push(issue);
    });
    return results;
  }

  // src/rules/frameRules.ts
  var STANDARD_MOBILE_HEIGHT = 812;
  function inspectFrame(frame, settings = DEFAULT_QA_SETTINGS) {
    const width = normalizeDimension(frame.width);
    const height = normalizeDimension(frame.height);
    const baseWidth = settings.frameWidth;
    const messages = [];
    let pageType = "unknown";
    if (width !== baseWidth) {
      pageType = "width-warning";
      messages.push({
        severity: "warning",
        title: `\u5F53\u524D Frame \u5BBD\u5EA6\u4E0D\u662F ${baseWidth}px\uFF0C\u4E0D\u7B26\u5408\u672C\u63D2\u4EF6\u7684\u79FB\u52A8\u7AEF\u68C0\u67E5\u57FA\u51C6\u3002`
      });
    } else if (height === STANDARD_MOBILE_HEIGHT) {
      pageType = "standard";
      messages.push({
        severity: "success",
        title: "\u8BE5 Frame \u662F\u6807\u51C6\u79FB\u52A8\u7AEF\u9875\u9762\u3002"
      });
    } else if (height > STANDARD_MOBILE_HEIGHT) {
      pageType = "long";
      messages.push({
        severity: "success",
        title: "\u8BE5 Frame \u662F\u79FB\u52A8\u7AEF\u957F\u9875\u9762\u3002"
      });
    } else {
      messages.push({
        severity: "info",
        title: "\u8BE5 Frame \u5BBD\u5EA6\u7B26\u5408 375px \u57FA\u51C6\uFF0C\u4F46\u9AD8\u5EA6\u5C0F\u4E8E 812px\uFF0C\u6682\u4E0D\u5224\u5B9A\u4E3A\u6807\u51C6\u9875\u6216\u957F\u9875\u9762\u3002"
      });
    }
    return {
      frameName: frame.name,
      width,
      height,
      childCount: getChildrenCount(frame),
      pageType,
      messages
    };
  }

  // src/rules/radiusRules.ts
  var BACKGROUND_SIZE_TOLERANCE2 = 2;
  var SIMILAR_SIZE_RATIO2 = 0.15;
  var RADIUS_DIFF_THRESHOLD = 2;
  var NESTING_TOLERANCE = 1;
  var MAX_NESTING_GAP = 40;
  var CAPSULE_TOLERANCE = 1;
  function analyzeRadiusIssues(frame) {
    const radiusNodes = getRadiusNodes(frame);
    const issues = [
      ...analyzeSiblingRadiusConsistency(radiusNodes, frame.id),
      ...analyzeNestedRadiusRelationship(radiusNodes, frame.id)
    ];
    return dedupeRadiusIssues(issues);
  }
  function analyzeSiblingRadiusConsistency(nodes, frameId) {
    const issues = [];
    const groups = /* @__PURE__ */ new Map();
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
            title: "\u5706\u89D2\u5173\u7CFB\u7591\u4F3C\u4E0D\u4E00\u81F4",
            severity: "warning",
            layerId: first.id,
            layerName: `${first.name} / ${second.name}`,
            relatedLayerId: second.id,
            relatedLayerName: second.name,
            currentValue,
            suggestion: "\u5EFA\u8BAE\u786E\u8BA4\u540C\u7C7B\u7EC4\u4EF6\u5706\u89D2\u662F\u5426\u7EDF\u4E00",
            detail: `\u8FD9\u4E24\u4E2A\u540C\u7236\u7EA7\u8282\u70B9\u540D\u79F0\u6216\u5C3A\u5BF8\u8F83\u76F8\u4F3C\uFF0C\u4F46\u5706\u89D2\u5206\u522B\u4E3A ${first.radius}px \u548C ${second.radius}px\u3002\u80F6\u56CA\u7EC4\u4EF6\u5DF2\u5355\u72EC\u5206\u7EC4\uFF0C\u4E0D\u4E0E\u666E\u901A\u5706\u89D2\u7EC4\u4EF6\u6DF7\u6BD4\u3002`
          });
        }
      }
    });
    return issues;
  }
  function analyzeNestedRadiusRelationship(nodes, frameId) {
    const issues = [];
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
          issues.push(createNestedIssue(outer, inner, inset, expectedInnerRadius, frameId, "\u5185\u5C42\u5706\u89D2\u660E\u663E\u5927\u4E8E\u5916\u5C42\u5706\u89D2"));
          return;
        }
        if (Math.abs(diff) > NESTING_TOLERANCE && inner.radius < expectedInnerRadius - NESTING_TOLERANCE) {
          issues.push(createNestedIssue(outer, inner, inset, expectedInnerRadius, frameId, "\u5185\u5916\u5706\u89D2\u5173\u7CFB\u7591\u4F3C\u65AD\u88C2"));
        }
      });
    });
    return issues;
  }
  function createNestedIssue(outer, inner, inset, expectedInnerRadius, frameId, title) {
    const currentValue = `\u5916 ${outer.radius}px / \u5185 ${inner.radius}px / \u95F4\u8DDD ${inset}px`;
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
      suggestion: `\u5EFA\u8BAE\u786E\u8BA4\u5185\u5C42\u5706\u89D2\u662F\u5426\u63A5\u8FD1 ${expectedInnerRadius}px`,
      detail: `\u5185\u5916\u5706\u89D2\u5E38\u89C1\u5173\u7CFB\u4E3A\uFF1A\u5185\u5C42\u5706\u89D2 \u2248 \u5916\u5C42\u5706\u89D2 - \u5185\u5916\u95F4\u8DDD\u3002\u5F53\u524D\u5916\u5C42\u5706\u89D2 ${outer.radius}px\uFF0C\u5185\u5916\u95F4\u8DDD\u7EA6 ${inset}px\uFF0C\u63A8\u7B97\u5185\u5C42\u5706\u89D2\u7EA6 ${expectedInnerRadius}px\u3002`
    };
  }
  function getRadiusNodes(frame) {
    return collectInspectableDescendants(frame).filter((node) => shouldCheckRadiusNode(node, frame)).map((node) => createRadiusNodeInfo(node)).filter((info) => Boolean(info));
  }
  function shouldCheckRadiusNode(node, frame) {
    if (node.type === "INSTANCE" || !node.visible || !("cornerRadius" in node) || !("width" in node) || !("height" in node)) {
      return false;
    }
    const candidate = node;
    const bounds = candidate.absoluteBoundingBox;
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      return false;
    }
    if (bounds.width >= frame.width - BACKGROUND_SIZE_TOLERANCE2 && bounds.height >= frame.height - BACKGROUND_SIZE_TOLERANCE2) {
      return false;
    }
    if (candidate.cornerRadius === figma.mixed || candidate.cornerRadius <= 0) {
      return false;
    }
    return true;
  }
  function createRadiusNodeInfo(node) {
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
      nameKey: createNameKey2(node.name)
    };
  }
  function createNameKey2(name) {
    return name.toLowerCase().replace(/\d+/g, "").replace(/[_\-#]/g, " ").replace(/\s+/g, " ").trim().slice(0, 24);
  }
  function areSimilarSize(first, second) {
    return isSimilarNumber2(first.bounds.width, second.bounds.width) && isSimilarNumber2(first.bounds.height, second.bounds.height);
  }
  function isSimilarNumber2(first, second) {
    const max = Math.max(first, second);
    if (max === 0) {
      return false;
    }
    return Math.abs(first - second) / max <= SIMILAR_SIZE_RATIO2;
  }
  function isInside(outer, inner) {
    return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
  }
  function getMinimumInset(outer, inner) {
    return normalizeDimension(
      Math.min(
        inner.x - outer.x,
        inner.y - outer.y,
        outer.x + outer.width - (inner.x + inner.width),
        outer.y + outer.height - (inner.y + inner.height)
      )
    );
  }
  function createRadiusIgnoreKey(type, frameId, layerId, relatedLayerId) {
    const parts = relatedLayerId ? [type, frameId, layerId, relatedLayerId] : [type, frameId, layerId];
    return parts.map((part) => part.replace(/\s+/g, " ").trim()).join("::");
  }
  function createRadiusIgnoreKeyAliases(type, frameId, currentValue, layerId) {
    return [
      [type, frameId, layerId, currentValue].map((part) => part.replace(/\s+/g, " ").trim()).join("::"),
      [type, layerId, currentValue, frameId].map((part) => part.replace(/\s+/g, " ").trim()).join("::")
    ];
  }
  function dedupeRadiusIssues(issues) {
    const seenKeys = /* @__PURE__ */ new Set();
    const results = [];
    issues.forEach((issue) => {
      if (seenKeys.has(issue.id)) {
        return;
      }
      seenKeys.add(issue.id);
      results.push(issue);
    });
    return results;
  }

  // src/rules/spacingRules.ts
  var MIN_SPACING_TO_CHECK = 2;
  var MAX_SPACING_TO_CHECK = 80;
  var BACKGROUND_SIZE_TOLERANCE3 = 2;
  var CENTER_ALIGNMENT_TOLERANCE2 = 4;
  var EDGE_ALIGNMENT_TOLERANCE2 = 2;
  var EDGE_ALIGNMENT_RATIO2 = 0.66;
  var BUTTON_SHAPE_TOLERANCE = 2;
  var BUTTON_RADIUS_TOLERANCE = 2;
  var BUTTON_PADDING_SYMMETRY_TOLERANCE = 2;
  var BUTTON_CENTER_TOLERANCE = 2;
  var ICON_CLUSTER_MAX_CHILDREN = 8;
  var ICON_CLUSTER_MAX_SIZE_RATIO = 0.8;
  function analyzeSpacingIssues(frame, settings = DEFAULT_QA_SETTINGS) {
    const issues = [];
    const parents = collectInspectableParents(frame);
    parents.forEach((parent) => {
      const parentBounds = getParentBounds2(parent);
      if (!parentBounds) {
        return;
      }
      const children = parent.children.filter((node) => shouldCheckNode2(node, parentBounds));
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
  function analyzeVerticalSpacing(nodes, frameId, settings) {
    const sortedNodes = [...nodes].sort((a, b) => getBounds2(a).y - getBounds2(b).y);
    const issues = [];
    for (let index = 0; index < sortedNodes.length - 1; index += 1) {
      const firstNode = sortedNodes[index];
      const secondNode = sortedNodes[index + 1];
      const firstBounds = getBounds2(firstNode);
      const secondBounds = getBounds2(secondNode);
      const gap = normalizeDimension(secondBounds.y - (firstBounds.y + firstBounds.height));
      if (!shouldCheckSpacing(gap) || !rangesOverlap2(firstBounds.x, firstBounds.x + firstBounds.width, secondBounds.x, secondBounds.x + secondBounds.width)) {
        continue;
      }
      const issue = createGapIssue(firstNode, secondNode, gap, "vertical", frameId, settings);
      if (issue) {
        issues.push(issue);
      }
    }
    return issues;
  }
  function analyzeHorizontalSpacing(nodes, frameId, settings) {
    const sortedNodes = [...nodes].sort((a, b) => getBounds2(a).x - getBounds2(b).x);
    const issues = [];
    for (let index = 0; index < sortedNodes.length - 1; index += 1) {
      const firstNode = sortedNodes[index];
      const secondNode = sortedNodes[index + 1];
      const firstBounds = getBounds2(firstNode);
      const secondBounds = getBounds2(secondNode);
      const gap = normalizeDimension(secondBounds.x - (firstBounds.x + firstBounds.width));
      if (!shouldCheckSpacing(gap) || !rangesOverlap2(firstBounds.y, firstBounds.y + firstBounds.height, secondBounds.y, secondBounds.y + secondBounds.height)) {
        continue;
      }
      const issue = createGapIssue(firstNode, secondNode, gap, "horizontal", frameId, settings);
      if (issue) {
        issues.push(issue);
      }
    }
    return issues;
  }
  function analyzeEdgeSpacing(parent, parentBounds, nodes, frameId, settings) {
    const issues = [];
    const iconButtonPadding = getIconButtonPaddingState(parent, parentBounds, nodes);
    if (iconButtonPadding) {
      return analyzeIconButtonClusterPadding(parent, iconButtonPadding, frameId);
    }
    const horizontalEdgeMode = getHorizontalEdgeMode(parent, parentBounds, nodes);
    if (horizontalEdgeMode !== "skip" && horizontalEdgeMode !== "pair-check") {
      issues.push(...createHorizontalEdgeIssues(parent, parentBounds, nodes, horizontalEdgeMode, frameId, settings));
    }
    nodes.forEach((node) => {
      const bounds = getBounds2(node);
      const edges = {
        left: {
          edge: "left",
          value: normalizeDimension(bounds.x - parentBounds.x),
          label: "\u5DE6"
        },
        right: {
          edge: "right",
          value: normalizeDimension(parentBounds.x + parentBounds.width - (bounds.x + bounds.width)),
          label: "\u53F3"
        },
        top: {
          edge: "top",
          value: normalizeDimension(bounds.y - parentBounds.y),
          label: "\u4E0A"
        },
        bottom: {
          edge: "bottom",
          value: normalizeDimension(parentBounds.y + parentBounds.height - (bounds.y + bounds.height)),
          label: "\u4E0B"
        }
      };
      if (horizontalEdgeMode === "pair-check") {
        issues.push(...createEdgePairIssues(node, parent, edges.left, edges.right, "horizontal", frameId, settings));
      }
      issues.push(...createEdgePairIssues(node, parent, edges.top, edges.bottom, "vertical", frameId, settings));
    });
    return issues;
  }
  function analyzeIconButtonClusterPadding(parent, state, frameId) {
    const issues = [];
    if (!state.isHorizontallyCentered) {
      issues.push(createEdgeMismatchIssue(state.representativeNode, parent, state.edges.left, state.edges.right, "horizontal", frameId));
    }
    if (!state.isVerticallyCentered) {
      issues.push(createEdgeMismatchIssue(state.representativeNode, parent, state.edges.top, state.edges.bottom, "vertical", frameId));
    }
    return issues;
  }
  function getIconButtonPaddingState(parent, parentBounds, nodes) {
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
      isHorizontallyCentered: Math.abs(edges.left.value - edges.right.value) <= BUTTON_PADDING_SYMMETRY_TOLERANCE && Math.abs(contentCenterX - parentCenterX) <= BUTTON_CENTER_TOLERANCE,
      isVerticallyCentered: Math.abs(edges.top.value - edges.bottom.value) <= BUTTON_PADDING_SYMMETRY_TOLERANCE && Math.abs(contentCenterY - parentCenterY) <= BUTTON_CENTER_TOLERANCE
    };
  }
  function isIconButtonLikeShape(parent, parentBounds) {
    if (parentBounds.width <= 0 || parentBounds.height <= 0) {
      return false;
    }
    return isNearlySquare(parentBounds) || hasCapsuleLikeRadius(parent, parentBounds);
  }
  function getMainIconButtonChildren(nodes, parentBounds) {
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
    const isCompactIconCluster = contentBounds.width <= parentBounds.width * ICON_CLUSTER_MAX_SIZE_RATIO && contentBounds.height <= parentBounds.height * ICON_CLUSTER_MAX_SIZE_RATIO;
    return isCompactIconCluster ? nodes : [];
  }
  function getCombinedBounds(nodes) {
    const minX = Math.min(...nodes.map((node) => getBounds2(node).x));
    const minY = Math.min(...nodes.map((node) => getBounds2(node).y));
    const maxX = Math.max(...nodes.map((node) => {
      const bounds = getBounds2(node);
      return bounds.x + bounds.width;
    }));
    const maxY = Math.max(...nodes.map((node) => {
      const bounds = getBounds2(node);
      return bounds.y + bounds.height;
    }));
    return {
      x: minX,
      y: minY,
      width: normalizeDimension(maxX - minX),
      height: normalizeDimension(maxY - minY)
    };
  }
  function createEdgeSpacingFromBounds(bounds, parentBounds) {
    return {
      left: {
        edge: "left",
        value: normalizeDimension(bounds.x - parentBounds.x),
        label: "\u5DE6"
      },
      right: {
        edge: "right",
        value: normalizeDimension(parentBounds.x + parentBounds.width - (bounds.x + bounds.width)),
        label: "\u53F3"
      },
      top: {
        edge: "top",
        value: normalizeDimension(bounds.y - parentBounds.y),
        label: "\u4E0A"
      },
      bottom: {
        edge: "bottom",
        value: normalizeDimension(parentBounds.y + parentBounds.height - (bounds.y + bounds.height)),
        label: "\u4E0B"
      }
    };
  }
  function isNearlySquare(bounds) {
    return Math.abs(bounds.width - bounds.height) <= BUTTON_SHAPE_TOLERANCE;
  }
  function hasCapsuleLikeRadius(node, bounds) {
    const radius = readUniformCornerRadius(node);
    if (radius === null) {
      return false;
    }
    return Math.abs(radius - Math.min(bounds.width, bounds.height) / 2) <= BUTTON_RADIUS_TOLERANCE;
  }
  function readUniformCornerRadius(node) {
    if (!("cornerRadius" in node)) {
      return null;
    }
    const radius = node.cornerRadius;
    return typeof radius === "number" ? radius : null;
  }
  function createHorizontalEdgeIssues(parent, parentBounds, nodes, mode, frameId, settings) {
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
    if (shouldCheckSpacing(contentEdges.left.value) && shouldCheckSpacing(contentEdges.right.value) && isClearlyAsymmetric(contentEdges.left.value, contentEdges.right.value, settings)) {
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
  function createGapIssue(firstNode, secondNode, gap, direction, frameId, settings) {
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
      title: "\u95F4\u8DDD\u7591\u4F3C\u4E0D\u89C4\u6574",
      severity: "warning",
      layerId: firstNode.id,
      layerName,
      relatedLayerId: secondNode.id,
      relatedLayerName: secondNode.name,
      currentValue,
      suggestion: `\u5F53\u524D\u57FA\u7840\u95F4\u8DDD\u5355\u4F4D\u4E3A ${settings.spacingBaseUnit}px\uFF0C\u5EFA\u8BAE\u786E\u8BA4\u662F\u5426\u7B26\u5408\u56E2\u961F\u89C4\u8303`,
      detail: `\u8BE5${direction === "vertical" ? "\u5782\u76F4" : "\u6C34\u5E73"}\u76F8\u90BB\u95F4\u8DDD\u4E3A ${gap}px\uFF0C\u5EFA\u8BAE\u786E\u8BA4\u662F\u5426\u8C03\u6574\u4E3A ${multipleInfo.suggestions}\u3002`,
      direction
    };
  }
  function createEdgePairIssues(node, parent, firstEdge, secondEdge, edgePair, frameId, settings) {
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
  function createEdgePairMultipleIssue(node, parent, firstEdge, secondEdge, firstInfo, secondInfo, edgePair, frameId, settings) {
    const currentValue = `${firstEdge.label} ${firstEdge.value}px / ${secondEdge.label} ${secondEdge.value}px`;
    return {
      id: `spacing-edge-not-multiple-${edgePair}-${node.id}-${currentValue}`,
      stableId: createSpacingIgnoreKey("spacing-edge-not-multiple", frameId, node.id, edgePair),
      ignoreKey: createSpacingIgnoreKey("spacing-edge-not-multiple", frameId, node.id, edgePair),
      type: "spacing-edge-not-multiple",
      title: `${edgePair === "horizontal" ? "\u5DE6\u53F3" : "\u4E0A\u4E0B"}\u8FB9\u8DDD\u4E0D\u7B26\u5408 ${settings.spacingBaseUnit}px \u500D\u6570`,
      severity: "warning",
      layerId: node.id,
      layerName: `${node.name} / \u7236\u7EA7\uFF1A${parent.name}`,
      currentValue,
      suggestion: `${firstEdge.label}\u4FA7\u5EFA\u8BAE\u8C03\u6574\u4E3A ${firstInfo.suggestions}\uFF0C${secondEdge.label}\u4FA7\u5EFA\u8BAE\u8C03\u6574\u4E3A ${secondInfo.suggestions}`,
      detail: `\u5F53\u524D\u57FA\u7840\u95F4\u8DDD\u5355\u4F4D\u4E3A ${settings.spacingBaseUnit}px\uFF0C${firstEdge.label}${firstEdge.value}px\uFF0C${secondEdge.label}${secondEdge.value}px\uFF0C\u5EFA\u8BAE\u786E\u8BA4\u662F\u5426\u7B26\u5408\u56E2\u961F\u89C4\u8303\u3002`,
      direction: edgePair,
      edge: edgePair
    };
  }
  function createSingleEdgeMultipleIssue(node, parent, edge, edgePair, multipleInfo, frameId, settings) {
    const currentValue = `${edge.label} ${edge.value}px`;
    return {
      id: `spacing-edge-not-multiple-${edge.edge}-${node.id}-${currentValue}`,
      stableId: createSpacingIgnoreKey("spacing-edge-not-multiple", frameId, node.id, edge.edge),
      ignoreKey: createSpacingIgnoreKey("spacing-edge-not-multiple", frameId, node.id, edge.edge),
      type: "spacing-edge-not-multiple",
      title: `${edge.label}\u8FB9\u8DDD\u4E0D\u7B26\u5408 ${settings.spacingBaseUnit}px \u500D\u6570`,
      severity: "warning",
      layerId: node.id,
      layerName: `${node.name} / \u7236\u7EA7\uFF1A${parent.name}`,
      currentValue,
      suggestion: `${edge.label}\u4FA7\u5EFA\u8BAE\u8C03\u6574\u4E3A ${multipleInfo.suggestions}`,
      detail: `\u5F53\u524D\u57FA\u7840\u95F4\u8DDD\u5355\u4F4D\u4E3A ${settings.spacingBaseUnit}px\uFF0C${edge.label}\u4FA7\u8FB9\u8DDD\u4E3A ${edge.value}px\uFF0C\u5EFA\u8BAE\u786E\u8BA4\u662F\u5426\u7B26\u5408\u56E2\u961F\u89C4\u8303\u3002`,
      direction: edgePair,
      edge: edge.edge
    };
  }
  function createEdgeMismatchIssue(node, parent, firstEdge, secondEdge, edgePair, frameId) {
    const currentValue = `${firstEdge.label} ${firstEdge.value}px / ${secondEdge.label} ${secondEdge.value}px`;
    return {
      id: `spacing-edge-mismatch-${edgePair}-${node.id}-${currentValue}`,
      stableId: createSpacingIgnoreKey("spacing-edge-mismatch", frameId, node.id, edgePair),
      ignoreKey: createSpacingIgnoreKey("spacing-edge-mismatch", frameId, node.id, edgePair),
      type: "spacing-edge-mismatch",
      title: `${edgePair === "horizontal" ? "\u5DE6\u53F3" : "\u4E0A\u4E0B"}\u8FB9\u8DDD\u7591\u4F3C\u4E0D\u4E00\u81F4`,
      severity: "warning",
      layerId: node.id,
      layerName: `${node.name} / \u7236\u7EA7\uFF1A${parent.name}`,
      currentValue,
      suggestion: `\u5EFA\u8BAE\u786E\u8BA4${edgePair === "horizontal" ? "\u5DE6\u53F3" : "\u4E0A\u4E0B"}\u8FB9\u8DDD\u662F\u5426\u9700\u8981\u4FDD\u6301\u4E00\u81F4`,
      detail: `${firstEdge.label}\u4FA7\u8FB9\u8DDD\u4E3A ${firstEdge.value}px\uFF0C${secondEdge.label}\u4FA7\u8FB9\u8DDD\u4E3A ${secondEdge.value}px\u3002\u82E5\u8BE5\u8282\u70B9\u662F\u4E3B\u8981\u5185\u5BB9\u5BB9\u5668\uFF0C\u5EFA\u8BAE\u786E\u8BA4\u4E24\u4FA7\u8FB9\u8DDD\u5173\u7CFB\u3002`,
      direction: edgePair,
      edge: edgePair
    };
  }
  function getHorizontalEdgeMode(parent, parentBounds, nodes) {
    const layoutMode = readAutoLayoutValue2(parent, "layoutMode");
    if (layoutMode === "HORIZONTAL") {
      return getAlignmentEdgeMode(readAutoLayoutValue2(parent, "primaryAxisAlignItems"));
    }
    if (layoutMode === "VERTICAL") {
      return getAlignmentEdgeMode(readAutoLayoutValue2(parent, "counterAxisAlignItems"));
    }
    return inferHorizontalEdgeMode(parentBounds, nodes);
  }
  function getAlignmentEdgeMode(alignment) {
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
  function readAutoLayoutValue2(node, key) {
    if (!(key in node)) {
      return "";
    }
    const value = node[key];
    return typeof value === "string" ? value : "";
  }
  function shouldCheckNode2(node, parentBounds) {
    if (!node.visible || !isMeasurableNode2(node)) {
      return false;
    }
    const bounds = node.absoluteBoundingBox;
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      return false;
    }
    if (bounds.width >= parentBounds.width - BACKGROUND_SIZE_TOLERANCE3 && bounds.height >= parentBounds.height - BACKGROUND_SIZE_TOLERANCE3) {
      return false;
    }
    return true;
  }
  function isMeasurableNode2(node) {
    return "width" in node && "height" in node && "absoluteBoundingBox" in node;
  }
  function shouldCheckSpacing(value) {
    return value >= MIN_SPACING_TO_CHECK && value <= MAX_SPACING_TO_CHECK;
  }
  function getSpacingMultipleInfo(value, settings) {
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
  function getHorizontalContentEdges(parentBounds, nodes) {
    if (!nodes.length) {
      return null;
    }
    let leftNode = nodes[0];
    let rightNode = nodes[0];
    let leftValue = getBounds2(leftNode).x;
    let rightValue = getBounds2(rightNode).x + getBounds2(rightNode).width;
    nodes.forEach((node) => {
      const bounds = getBounds2(node);
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
        label: "\u5DE6"
      },
      right: {
        edge: "right",
        value: normalizeDimension(parentBounds.x + parentBounds.width - rightValue),
        label: "\u53F3"
      },
      leftNode,
      rightNode
    };
  }
  function inferHorizontalEdgeMode(parentBounds, nodes) {
    const contentEdges = getHorizontalContentEdges(parentBounds, nodes);
    if (!contentEdges) {
      return "skip";
    }
    const groupCenterX = normalizeDimension(
      parentBounds.x + contentEdges.left.value + (parentBounds.width - contentEdges.left.value - contentEdges.right.value) / 2
    );
    const parentCenterX = normalizeDimension(parentBounds.x + parentBounds.width / 2);
    if (Math.abs(groupCenterX - parentCenterX) <= CENTER_ALIGNMENT_TOLERANCE2) {
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
    if (hasMajorityAlignedEdge2(nodes, "left")) {
      return "left-only";
    }
    if (hasMajorityAlignedEdge2(nodes, "right")) {
      return "right-only";
    }
    return "skip";
  }
  function hasMajorityAlignedEdge2(nodes, edge) {
    if (nodes.length < 2) {
      return false;
    }
    const values = nodes.map((node) => {
      const bounds = getBounds2(node);
      return edge === "left" ? bounds.x : bounds.x + bounds.width;
    });
    const alignedCount = values.filter((value) => {
      const nearbyValues = values.filter((candidate) => Math.abs(candidate - value) <= EDGE_ALIGNMENT_TOLERANCE2);
      return nearbyValues.length / values.length >= EDGE_ALIGNMENT_RATIO2;
    }).length;
    return alignedCount / values.length >= EDGE_ALIGNMENT_RATIO2;
  }
  function isClearlyAsymmetric(first, second, settings) {
    const threshold = Math.max(settings.spacingBaseUnit * 2, settings.spacingTolerance);
    return Math.abs(first - second) > threshold;
  }
  function formatSuggestedValues(nearestLower, nearestUpper) {
    if (nearestLower === nearestUpper) {
      return `${nearestLower}px`;
    }
    return `${nearestLower}px \u6216 ${nearestUpper}px`;
  }
  function rangesOverlap2(startA, endA, startB, endB) {
    return Math.min(endA, endB) - Math.max(startA, startB) > 0;
  }
  function getParentBounds2(parent) {
    if ("absoluteBoundingBox" in parent && parent.absoluteBoundingBox) {
      return parent.absoluteBoundingBox;
    }
    return null;
  }
  function getBounds2(node) {
    return node.absoluteBoundingBox || {
      x: node.absoluteTransform[0][2],
      y: node.absoluteTransform[1][2],
      width: node.width,
      height: node.height
    };
  }
  function createSpacingIgnoreKey(type, frameId, layerId, relatedIdOrEdge, direction) {
    return [type, frameId, layerId, relatedIdOrEdge || "", direction || ""].filter(Boolean).map((part) => part.replace(/\s+/g, " ").trim()).join("::");
  }
  function createSpacingIgnoreKeyAliases(type, frameId, currentValue, layerId) {
    return [
      [type, frameId, layerId, currentValue].map((part) => part.replace(/\s+/g, " ").trim()).join("::"),
      [type, layerId, currentValue, frameId].map((part) => part.replace(/\s+/g, " ").trim()).join("::")
    ];
  }
  function dedupeSpacingIssues(issues) {
    const seenKeys = /* @__PURE__ */ new Set();
    const results = [];
    issues.forEach((issue) => {
      if (seenKeys.has(issue.id)) {
        return;
      }
      seenKeys.add(issue.id);
      results.push(issue);
    });
    return results;
  }

  // src/rules/typographyRules.ts
  var TEXT_PREVIEW_MAX_LENGTH = 20;
  var UNKNOWN_VALUE = "Unknown";
  var MIXED_VALUE = "Mixed";
  var MAX_RECOMMENDED_FONT_FAMILIES = 3;
  var MAX_RECOMMENDED_FONT_SIZES = 8;
  function scanTextLayers(frame) {
    const textNodes = collectInspectableDescendants(frame).filter((node) => node.type === "TEXT");
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
  function groupTextLayersByTypography(textLayers) {
    const familyMap = /* @__PURE__ */ new Map();
    const weightMaps = /* @__PURE__ */ new Map();
    const sizeMaps = /* @__PURE__ */ new Map();
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
        weightMaps.set(familyKey, /* @__PURE__ */ new Map());
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
        sizeMaps.set(`${familyKey}::${weightKey}`, /* @__PURE__ */ new Map());
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
  function createTypographySummary(textLayers, typographyGroups) {
    const sizeSet = /* @__PURE__ */ new Set();
    const weightSet = /* @__PURE__ */ new Set();
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
  function analyzeTypographyIssues(textLayers, typographyGroups, settings = DEFAULT_QA_SETTINGS, frameId = "unknown-frame") {
    const issues = [];
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
            title: "\u5B57\u53F7\u4F4E\u4E8E\u5F31\u5316\u4FE1\u606F\u4E0B\u9650",
            severity: "serious",
            layerId: layer.id,
            layerName: layer.name,
            textPreview: layer.text,
            currentValue,
            suggestion: `\u5EFA\u8BAE >= ${minTinyTextSize}px`,
            detail: `\u8BE5\u6587\u672C\u5B57\u53F7\u4E3A ${layer.fontSize}px\uFF0C\u4F4E\u4E8E\u5F53\u524D\u8BBE\u7F6E\u7684\u5F31\u5316\u4FE1\u606F\u4E0B\u9650 ${minTinyTextSize}px\uFF0C\u53EF\u80FD\u5F71\u54CD\u8BC6\u522B\u3002`
          });
        } else if (layer.fontSize >= minTinyTextSize && layer.fontSize < smallTextWarningSize) {
          const currentValue = `${layer.fontSize}px`;
          issues.push({
            id: `font-size-small-warning-${layer.id}`,
            stableId: createIssueIgnoreKey("font-size-small-warning", frameId, currentValue, layer.id),
            ignoreKey: createIssueIgnoreKey("font-size-small-warning", frameId, currentValue, layer.id),
            ignoreKeyAliases: createIssueIgnoreKeyAliases("font-size-small-warning", frameId, currentValue, layer.id),
            type: "font-size-small-warning",
            title: "\u5C0F\u5B57\u53F7\u4F7F\u7528\u63D0\u793A",
            severity: "warning",
            layerId: layer.id,
            layerName: layer.name,
            textPreview: layer.text,
            currentValue,
            suggestion: `\u6B63\u6587\u5EFA\u8BAE >= ${smallTextWarningSize}px\uFF1B\u5F31\u5316\u4FE1\u606F\u53EF\u4FDD\u7559`,
            detail: `\u8BE5\u6587\u672C\u5B57\u53F7\u4E3A ${layer.fontSize}px\uFF0C\u9002\u5408\u5F31\u5316\u4FE1\u606F\u3001\u8F85\u52A9\u8BF4\u660E\u6216\u6807\u7B7E\u3002\u82E5\u627F\u62C5\u6B63\u6587\u9605\u8BFB\u529F\u80FD\uFF0C\u5EFA\u8BAE\u63D0\u9AD8\u5230 ${smallTextWarningSize}px \u6216 ${bodyTextReferenceSize}px \u4EE5\u4E0A\u3002`
          });
        } else if (layer.fontSize >= smallTextWarningSize && layer.fontSize < bodyTextReferenceSize) {
          const currentValue = `${layer.fontSize}px`;
          issues.push({
            id: `font-size-body-risk-${layer.id}`,
            stableId: createIssueIgnoreKey("font-size-body-risk", frameId, currentValue, layer.id),
            ignoreKey: createIssueIgnoreKey("font-size-body-risk", frameId, currentValue, layer.id),
            ignoreKeyAliases: createIssueIgnoreKeyAliases("font-size-body-risk", frameId, currentValue, layer.id),
            type: "font-size-body-risk",
            title: "\u6B63\u6587\u9605\u8BFB\u5B57\u53F7\u504F\u5C0F",
            severity: "info",
            layerId: layer.id,
            layerName: layer.name,
            textPreview: layer.text,
            currentValue,
            suggestion: `\u4E3B\u6B63\u6587\u5EFA\u8BAE >= ${bodyTextReferenceSize}px\uFF1B\u8F85\u52A9\u8BF4\u660E\u53EF\u4FDD\u7559`,
            detail: `\u8BE5\u6587\u672C\u5B57\u53F7\u4E3A ${layer.fontSize}px\uFF0C\u4F4D\u4E8E\u5F53\u524D\u6B63\u6587\u53C2\u8003\u5B57\u53F7 ${bodyTextReferenceSize}px \u4EE5\u4E0B\u3002\u63D2\u4EF6\u65E0\u6CD5\u5224\u65AD\u8BED\u4E49\u89D2\u8272\uFF0C\u8BF7\u6309\u5B9E\u9645\u5185\u5BB9\u786E\u8BA4\u3002`
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
          title: "\u6587\u672C\u6837\u5F0F\u6DF7\u5408",
          severity: "warning",
          layerId: layer.id,
          layerName: layer.name,
          textPreview: layer.text,
          currentValue,
          suggestion: "\u5EFA\u8BAE\u786E\u8BA4\u662F\u5426\u6709\u610F\u6DF7\u7528",
          detail: "\u8BE5\u6587\u672C\u56FE\u5C42\u5185\u90E8\u5B58\u5728 Mixed \u6837\u5F0F\uFF0C\u53EF\u80FD\u5305\u542B\u591A\u4E2A\u5B57\u4F53\u3001\u5B57\u53F7\u6216\u5B57\u91CD\u3002Mixed \u4E0D\u4E00\u5B9A\u662F\u9519\u8BEF\uFF0C\u4F46\u5EFA\u8BAE\u786E\u8BA4\u662F\u5426\u4E3A\u6709\u610F\u8BBE\u7F6E\u3002"
        });
      }
    });
    const normalFontFamilyCount = typographyGroups.filter((group) => isNormalTypographyValue(group.fontFamily)).length;
    if (normalFontFamilyCount > MAX_RECOMMENDED_FONT_FAMILIES) {
      const currentValue = `${normalFontFamilyCount} \u79CD\u5B57\u4F53`;
      issues.push({
        id: "too-many-font-families",
        stableId: createIssueIgnoreKey("too-many-font-families", frameId, currentValue),
        ignoreKey: createIssueIgnoreKey("too-many-font-families", frameId, currentValue),
        type: "too-many-font-families",
        title: "\u5B57\u4F53\u79CD\u7C7B\u504F\u591A",
        severity: "warning",
        currentValue,
        suggestion: "\u5EFA\u8BAE\u786E\u8BA4\u662F\u5426\u5B58\u5728\u65E0\u610F\u6DF7\u7528",
        detail: `\u5F53\u524D\u9875\u9762\u68C0\u6D4B\u5230 ${normalFontFamilyCount} \u79CD\u6B63\u5E38\u5B57\u4F53\u3002\u79FB\u52A8\u7AEF\u5355\u9875\u901A\u5E38\u5EFA\u8BAE\u63A7\u5236\u4E3B\u8981\u5B57\u4F53\u79CD\u7C7B\uFF0C\u4EE5\u4FDD\u6301\u89C6\u89C9\u7EDF\u4E00\u3002Mixed \u4E0D\u8BA1\u5165\u8BE5\u6570\u91CF\u3002`
      });
    }
    const normalFontSizeCount = getNormalFontSizeCount(textLayers);
    if (normalFontSizeCount > MAX_RECOMMENDED_FONT_SIZES) {
      const currentValue = `${normalFontSizeCount} \u79CD\u5B57\u53F7`;
      issues.push({
        id: "too-many-font-sizes",
        stableId: createIssueIgnoreKey("too-many-font-sizes", frameId, currentValue),
        ignoreKey: createIssueIgnoreKey("too-many-font-sizes", frameId, currentValue),
        type: "too-many-font-sizes",
        title: "\u5B57\u53F7\u5C42\u7EA7\u504F\u591A",
        severity: "warning",
        currentValue,
        suggestion: "\u5EFA\u8BAE\u786E\u8BA4\u5C42\u7EA7\u662F\u5426\u90FD\u5FC5\u8981",
        detail: `\u5F53\u524D\u9875\u9762\u68C0\u6D4B\u5230 ${normalFontSizeCount} \u79CD\u5B57\u53F7\u3002\u8BF7\u786E\u8BA4\u8FD9\u4E9B\u5B57\u53F7\u662F\u5426\u90FD\u627F\u62C5\u660E\u786E\u5C42\u7EA7\uFF0C\u907F\u514D\u6587\u672C\u5C42\u7EA7\u8FC7\u788E\u3002`
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
      const currentValue = `\u5F53\u524D\u5B57\u4F53\u5B58\u5728 ${fontWeights.length} \u79CD\u5B57\u91CD`;
      const stableId = createIssueIgnoreKey("too-many-font-weights", frameId, currentValue, `font-family:${fontFamily}`);
      issues.push({
        id: `too-many-font-weights-${fontFamily}`,
        stableId,
        ignoreKey: stableId,
        type: "too-many-font-weights",
        title: "\u5B57\u91CD\u79CD\u7C7B\u504F\u591A",
        severity: "warning",
        currentValue,
        suggestion: "\u786E\u8BA4\u662F\u5426\u90FD\u627F\u62C5\u660E\u786E\u5C42\u7EA7\uFF1B\u540C\u7C7B\u6587\u672C\u5EFA\u8BAE\u7EDF\u4E00\u5B57\u91CD",
        detail: `${fontFamily} \u68C0\u6D4B\u5230 ${fontWeights.length} \u79CD\u6B63\u5E38\u5B57\u91CD\uFF1A${fontWeights.join(" / ")}\u3002Mixed \u4E0D\u8BA1\u5165\u8BE5\u6570\u91CF\u3002`
      });
    });
    return issues.sort(compareTypographyIssues);
  }
  function createIssueSummary(issues) {
    return {
      total: issues.length,
      serious: issues.filter((issue) => issue.severity === "serious").length,
      warning: issues.filter((issue) => issue.severity === "warning").length,
      info: issues.filter((issue) => issue.severity === "info").length
    };
  }
  function readTextCharacters(node) {
    try {
      return node.characters;
    } catch (e) {
      return "";
    }
  }
  function createTextPreview(characters) {
    const normalizedText = characters.replace(/\s+/g, " ").trim();
    if (normalizedText.length <= TEXT_PREVIEW_MAX_LENGTH) {
      return normalizedText || "\u7A7A\u6587\u672C";
    }
    return `${normalizedText.slice(0, TEXT_PREVIEW_MAX_LENGTH)}...`;
  }
  function readFontSize(node) {
    try {
      if (node.fontSize === figma.mixed) {
        return MIXED_VALUE;
      }
      return normalizeDimension(node.fontSize);
    } catch (e) {
      return UNKNOWN_VALUE;
    }
  }
  function readFontNameInfo(node) {
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
    } catch (e) {
      return {
        fontFamily: UNKNOWN_VALUE,
        fontStyle: UNKNOWN_VALUE,
        fontName: UNKNOWN_VALUE
      };
    }
  }
  function readFontWeight(node) {
    try {
      if (node.fontWeight === figma.mixed) {
        return MIXED_VALUE;
      }
      return node.fontWeight;
    } catch (e) {
      return UNKNOWN_VALUE;
    }
  }
  function getTextColorHex(node) {
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
    } catch (e) {
      return UNKNOWN_VALUE;
    }
  }
  function rgbToHex(color) {
    const channels = [color.r, color.g, color.b].map((value) => {
      const channel = Math.round(value * 255);
      return channel.toString(16).padStart(2, "0");
    });
    return `#${channels.join("")}`.toUpperCase();
  }
  function getPositionRelativeToFrame(node, frame) {
    const nodeTransform = node.absoluteTransform;
    const frameTransform = frame.absoluteTransform;
    return {
      x: normalizeDimension(nodeTransform[0][2] - frameTransform[0][2]),
      y: normalizeDimension(nodeTransform[1][2] - frameTransform[1][2])
    };
  }
  function createWeightKey(layer) {
    return `${layer.fontStyle || UNKNOWN_VALUE}::${String(layer.fontWeight || UNKNOWN_VALUE)}`;
  }
  function createIssueIgnoreKey(type, frameId, currentValue, layerId) {
    const parts = layerId ? [type, frameId, layerId] : [type, frameId];
    return parts.map(normalizeIgnoreKeyPart).join("::");
  }
  function createIssueIgnoreKeyAliases(type, frameId, currentValue, layerId) {
    if (!layerId) {
      return [[type, frameId, currentValue].map(normalizeIgnoreKeyPart).join("::")];
    }
    return [
      [type, frameId, layerId, currentValue].map(normalizeIgnoreKeyPart).join("::"),
      [type, layerId, currentValue, frameId].map(normalizeIgnoreKeyPart).join("::")
    ];
  }
  function normalizeIgnoreKeyPart(value) {
    return value.replace(/\s+/g, " ").trim();
  }
  function compareFamilyGroups(a, b) {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.fontFamily.localeCompare(b.fontFamily);
  }
  function compareWeightGroups(a, b) {
    const weightCompare = compareTextPropertyValue(a.fontWeight, b.fontWeight);
    if (weightCompare !== 0) {
      return weightCompare;
    }
    return a.fontStyle.localeCompare(b.fontStyle);
  }
  function compareSizeGroups(a, b) {
    return compareTextPropertyValue(a.fontSize, b.fontSize);
  }
  function compareTextPropertyValue(a, b) {
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
  function compareLayers(a, b) {
    if (a.y !== b.y) {
      return a.y - b.y;
    }
    if (a.x !== b.x) {
      return a.x - b.x;
    }
    return a.name.localeCompare(b.name);
  }
  function hasMixedTypographyStyle(layer) {
    return layer.fontName === MIXED_VALUE || layer.fontSize === MIXED_VALUE || layer.fontWeight === MIXED_VALUE;
  }
  function getMixedCurrentValue(layer) {
    const mixedFields = [];
    if (layer.fontName === MIXED_VALUE) {
      mixedFields.push("\u5B57\u4F53 Mixed");
    }
    if (layer.fontSize === MIXED_VALUE) {
      mixedFields.push("\u5B57\u53F7 Mixed");
    }
    if (layer.fontWeight === MIXED_VALUE) {
      mixedFields.push("\u5B57\u91CD Mixed");
    }
    return mixedFields.join(" / ") || MIXED_VALUE;
  }
  function isNormalTypographyValue(value) {
    return value !== MIXED_VALUE && value !== UNKNOWN_VALUE && value !== "";
  }
  function getNormalFontSizeCount(textLayers) {
    const fontSizes = /* @__PURE__ */ new Set();
    textLayers.forEach((layer) => {
      if (typeof layer.fontSize === "number") {
        fontSizes.add(layer.fontSize);
      }
    });
    return fontSizes.size;
  }
  function getNormalFontWeights(group) {
    const fontWeights = /* @__PURE__ */ new Set();
    group.weights.forEach((weightGroup) => {
      if (isNormalTypographyValue(weightGroup.fontWeight)) {
        fontWeights.add(String(weightGroup.fontWeight));
      }
    });
    return Array.from(fontWeights).sort((first, second) => first.localeCompare(second, void 0, { numeric: true }));
  }
  function compareTypographyIssues(a, b) {
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

  // src/utils/issueIgnoreUtils.ts
  var IGNORED_ISSUES_STORAGE_KEY = "mobile-ui-qa-inspector-ignored-issues";
  async function loadIgnoredIssueKeys() {
    try {
      const storedValue = await figma.clientStorage.getAsync(IGNORED_ISSUES_STORAGE_KEY);
      if (!Array.isArray(storedValue)) {
        return /* @__PURE__ */ new Set();
      }
      return new Set(storedValue.filter((key) => typeof key === "string"));
    } catch (e) {
      return /* @__PURE__ */ new Set();
    }
  }
  async function saveIgnoredIssueKeys(ignoreKeys) {
    await figma.clientStorage.setAsync(IGNORED_ISSUES_STORAGE_KEY, Array.from(ignoreKeys));
  }

  // src/utils/messageUtils.ts
  function postToUi(message) {
    figma.ui.postMessage(message);
  }
  function createSingleMessage(severity, title) {
    return {
      severity,
      title
    };
  }

  // src/code.ts
  var currentSettings = __spreadValues({}, DEFAULT_QA_SETTINGS);
  var ignoredIssueKeys = /* @__PURE__ */ new Set();
  var ignoredIssueKeysLoaded = false;
  var ignoredIssueKeysNeedSave = false;
  var lastInspectedFrameId = null;
  figma.showUI(__html__, {
    width: 390,
    height: 844,
    themeColors: true
  });
  postToUi({
    type: "plugin-ready",
    message: "\u8BF7\u9009\u62E9\u4E00\u4E2A\u79FB\u52A8\u7AEF Frame\uFF0C\u7136\u540E\u70B9\u51FB\u300C\u5F00\u59CB\u68C0\u67E5\u300D\u3002"
  });
  figma.ui.onmessage = (message) => {
    void handleUiMessage(message);
  };
  async function handleUiMessage(message) {
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
  async function runInspection(frameId) {
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
    const result = __spreadProps(__spreadValues({}, frameResult), {
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
    });
    postToUi({
      type: "inspection-result",
      result
    });
  }
  async function getFrameForInspection(frameId) {
    if (frameId) {
      const node = await figma.getNodeByIdAsync(frameId);
      if (node && node.type === "FRAME") {
        return node;
      }
      postToUi({
        type: "inspection-error",
        messages: [createSingleMessage("warning", "\u672A\u627E\u5230\u4E0A\u6B21\u68C0\u67E5\u7684 Frame\uFF0C\u8BF7\u91CD\u65B0\u9009\u4E2D\u79FB\u52A8\u7AEF Frame\u3002")]
      });
      return null;
    }
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      postToUi({
        type: "inspection-error",
        messages: [createSingleMessage("warning", "\u8BF7\u5148\u9009\u4E2D\u4E00\u4E2A\u79FB\u52A8\u7AEF Frame\u3002")]
      });
      return null;
    }
    const selectedNode = selection[0];
    if (selectedNode.type !== "FRAME") {
      postToUi({
        type: "inspection-error",
        messages: [
          createSingleMessage("warning", "\u5F53\u524D\u9009\u4E2D\u7684\u5BF9\u8C61\u4E0D\u662F Frame\uFF0C\u8BF7\u9009\u4E2D\u9700\u8981\u68C0\u67E5\u7684\u79FB\u52A8\u7AEF\u9875\u9762\u3002")
        ]
      });
      return null;
    }
    return selectedNode;
  }
  async function sendCurrentSettings() {
    currentSettings = await loadQaSettings();
    await ensureIgnoredIssueKeysLoaded();
    postToUi({
      type: "settings-loaded",
      settings: currentSettings
    });
  }
  async function saveSettings(settings) {
    try {
      currentSettings = await saveQaSettings(settings);
      postToUi({
        type: "settings-saved",
        settings: currentSettings,
        message: "\u8BBE\u7F6E\u5DF2\u4FDD\u5B58"
      });
    } catch (e) {
      currentSettings = __spreadValues({}, DEFAULT_QA_SETTINGS);
      postToUi({
        type: "settings-error",
        settings: currentSettings,
        message: "\u8BBE\u7F6E\u4FDD\u5B58\u5931\u8D25\uFF0C\u5DF2\u56DE\u9000\u5230\u9ED8\u8BA4\u8BBE\u7F6E\u3002"
      });
    }
  }
  async function resetSettings() {
    try {
      currentSettings = await resetQaSettings();
      postToUi({
        type: "settings-reset",
        settings: currentSettings,
        message: "\u5DF2\u6062\u590D\u9ED8\u8BA4\u8BBE\u7F6E"
      });
    } catch (e) {
      currentSettings = __spreadValues({}, DEFAULT_QA_SETTINGS);
      postToUi({
        type: "settings-error",
        settings: currentSettings,
        message: "\u6062\u590D\u9ED8\u8BA4\u8BBE\u7F6E\u5931\u8D25\uFF0C\u5DF2\u4F7F\u7528\u9ED8\u8BA4\u8BBE\u7F6E\u3002"
      });
    }
  }
  async function ignoreIssue(ignoreKey) {
    await ensureIgnoredIssueKeysLoaded();
    ignoredIssueKeys.add(ignoreKey);
    try {
      await saveIgnoredIssueKeys(ignoredIssueKeys);
    } catch (e) {
      ignoredIssueKeys.delete(ignoreKey);
    }
  }
  async function restoreIssue(ignoreKey) {
    await ensureIgnoredIssueKeysLoaded();
    ignoredIssueKeys.delete(ignoreKey);
    try {
      await saveIgnoredIssueKeys(ignoredIssueKeys);
    } catch (e) {
      ignoredIssueKeys.add(ignoreKey);
    }
  }
  async function ensureIgnoredIssueKeysLoaded() {
    if (ignoredIssueKeysLoaded) {
      return;
    }
    ignoredIssueKeys = await loadIgnoredIssueKeys();
    ignoredIssueKeysLoaded = true;
  }
  function splitIgnoredIssues(issues) {
    const activeIssues = [];
    const ignoredIssues = [];
    const seenIssueKeys = /* @__PURE__ */ new Set();
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
  function getMatchedIgnoredIssueKey(issue) {
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
  function getPrimaryIgnoreKey(issue) {
    return issue.stableId || issue.ignoreKey;
  }
  async function saveIgnoredIssueKeysIfNeeded() {
    if (!ignoredIssueKeysNeedSave) {
      return;
    }
    ignoredIssueKeysNeedSave = false;
    try {
      await saveIgnoredIssueKeys(ignoredIssueKeys);
    } catch (e) {
    }
  }
  async function focusNode(nodeId) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || !isSceneNode(node)) {
      postToUi({
        type: "focus-node-result",
        success: false,
        message: "\u672A\u627E\u5230\u5BF9\u5E94\u56FE\u5C42\uFF0C\u53EF\u80FD\u5DF2\u88AB\u5220\u9664\u6216\u79FB\u52A8\u3002"
      });
      return;
    }
    figma.currentPage.selection = [node];
    figma.viewport.scrollAndZoomIntoView([node]);
    postToUi({
      type: "focus-node-result",
      success: true,
      message: `\u5DF2\u5B9A\u4F4D\u5230\u56FE\u5C42\uFF1A${node.name}`
    });
  }
  function isSceneNode(node) {
    return "absoluteTransform" in node;
  }
})();
