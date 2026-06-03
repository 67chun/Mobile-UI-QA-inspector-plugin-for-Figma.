import type { CheckMessage, FrameInspectionResult, QaSettings } from "../types";
import { getChildrenCount, normalizeDimension } from "../utils/nodeUtils";
import { DEFAULT_QA_SETTINGS } from "../utils/settingsUtils";

const STANDARD_MOBILE_HEIGHT = 812;

// Frame 基础检查：只判断尺寸基准，不修改 Figma 画布。
export function inspectFrame(frame: FrameNode, settings: QaSettings = DEFAULT_QA_SETTINGS): FrameInspectionResult {
  const width = normalizeDimension(frame.width);
  const height = normalizeDimension(frame.height);
  const baseWidth = settings.frameWidth;
  const messages: CheckMessage[] = [];

  let pageType: FrameInspectionResult["pageType"] = "unknown";

  if (width !== baseWidth) {
    pageType = "width-warning";
    messages.push({
      severity: "warning",
      title: `当前 Frame 宽度不是 ${baseWidth}px，不符合本插件的移动端检查基准。`
    });
  } else if (height === STANDARD_MOBILE_HEIGHT) {
    pageType = "standard";
    messages.push({
      severity: "success",
      title: "该 Frame 是标准移动端页面。"
    });
  } else if (height > STANDARD_MOBILE_HEIGHT) {
    pageType = "long";
    messages.push({
      severity: "success",
      title: "该 Frame 是移动端长页面。"
    });
  } else {
    messages.push({
      severity: "info",
      title: "该 Frame 宽度符合 375px 基准，但高度小于 812px，暂不判定为标准页或长页面。"
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
