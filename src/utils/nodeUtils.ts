// Figma 的尺寸可能是小数。这里保留两位，避免 375.0000001 这类浮点误差影响判断。
export function normalizeDimension(value: number): number {
  return Number(value.toFixed(2));
}

export function getChildrenCount(frame: FrameNode): number {
  return frame.children.length;
}

export type InspectableParentNode = SceneNode & {
  children: readonly SceneNode[];
};

export function hasSceneChildren(node: SceneNode): node is InspectableParentNode {
  return "children" in node && Array.isArray((node as InspectableParentNode).children);
}

export function canScanChildren(node: SceneNode): node is InspectableParentNode {
  return (
    node.type !== "INSTANCE" &&
    hasSceneChildren(node) &&
    (
      node.type === "FRAME" ||
      node.type === "GROUP" ||
      node.type === "SECTION" ||
      node.type === "COMPONENT" ||
      node.type === "COMPONENT_SET"
    )
  );
}

export function collectInspectableDescendants(frame: FrameNode): SceneNode[] {
  const results: SceneNode[] = [];

  frame.children.forEach((child) => {
    collectInspectableNode(child, results);
  });

  return results;
}

export function collectInspectableParents(frame: FrameNode): InspectableParentNode[] {
  const parents: InspectableParentNode[] = [frame as InspectableParentNode];

  collectInspectableDescendants(frame).forEach((node) => {
    if (canScanChildren(node)) {
      parents.push(node);
    }
  });

  return parents;
}

function collectInspectableNode(node: SceneNode, results: SceneNode[]): void {
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
