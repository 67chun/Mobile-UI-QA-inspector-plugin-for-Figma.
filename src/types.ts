export type CheckSeverity = "success" | "warning" | "info" | "error";

export type TextPropertyValue = number | string;

export interface CheckMessage {
  severity: CheckSeverity;
  title: string;
  description?: string;
}

export interface TextLayerInfo {
  id: string;
  name: string;
  text: string;
  fontSize: TextPropertyValue;
  fontFamily: string;
  fontStyle: string;
  fontName: string;
  fontWeight: TextPropertyValue;
  colorHex: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TypographySizeGroup {
  fontSize: TextPropertyValue;
  count: number;
  layers: TextLayerInfo[];
}

export interface TypographyWeightGroup {
  fontStyle: string;
  fontWeight: TextPropertyValue;
  count: number;
  sizes: TypographySizeGroup[];
}

export interface TypographyFamilyGroup {
  fontFamily: string;
  count: number;
  weights: TypographyWeightGroup[];
}

export interface TypographySummary {
  totalTextLayers: number;
  fontFamilyCount: number;
  fontSizeCount: number;
  fontWeightCount: number;
}

export type TypographyIssueType =
  | "font-size-below-minimum"
  | "font-size-small-warning"
  | "font-size-body-risk"
  | "mixed-text-style"
  | "too-many-font-families"
  | "too-many-font-sizes"
  | "too-many-font-weights";

export type SpacingIssueType =
  | "spacing-not-multiple"
  | "spacing-edge-not-multiple"
  | "spacing-edge-mismatch";
export type RadiusIssueType = "radius-inconsistent" | "radius-nesting-mismatch";
export type AlignmentIssueType =
  | "alignment-left-offset"
  | "alignment-center-offset"
  | "alignment-similar-offset";

export type IssueSeverity = "serious" | "warning" | "info";

export interface InspectIssueBase {
  id: string;
  stableId: string;
  ignoreKey: string;
  ignoreKeyAliases?: string[];
  severity: IssueSeverity;
  title: string;
  layerId?: string;
  layerName?: string;
  textPreview?: string;
  currentValue?: string;
  suggestion: string;
  detail?: string;
}

export interface TypographyIssue extends InspectIssueBase {
  type: TypographyIssueType;
}

export interface SpacingIssue extends InspectIssueBase {
  type: SpacingIssueType;
  relatedLayerId?: string;
  relatedLayerName?: string;
  direction: "horizontal" | "vertical";
  edge?: "left" | "right" | "top" | "bottom" | "horizontal" | "vertical";
}

export interface RadiusIssue extends InspectIssueBase {
  type: RadiusIssueType;
  relatedLayerId?: string;
  relatedLayerName?: string;
}

export interface AlignmentIssue extends InspectIssueBase {
  type: AlignmentIssueType;
  relatedLayerId?: string;
  relatedLayerName?: string;
  direction: "horizontal" | "vertical";
}

export interface IssueSummary {
  total: number;
  serious: number;
  warning: number;
  info: number;
}

export type TypographyIssueSummary = IssueSummary;
export type SpacingIssueSummary = IssueSummary;
export type RadiusIssueSummary = IssueSummary;
export type AlignmentIssueSummary = IssueSummary;

export interface QaSettings {
  settingsVersion?: number;
  frameWidth: number;
  pageHorizontalMargin: number;
  minTinyTextSize: number;
  smallTextWarningSize: number;
  bodyTextReferenceSize: number;
  spacingBaseUnit: number;
  spacingTolerance: number;
}

export interface FrameInspectionResult {
  frameName: string;
  width: number;
  height: number;
  childCount: number;
  pageType: "standard" | "long" | "width-warning" | "unknown";
  messages: CheckMessage[];
}

export interface InspectionResult extends FrameInspectionResult {
  textLayers: TextLayerInfo[];
  typographyGroups: TypographyFamilyGroup[];
  typographySummary: TypographySummary;
  typographyIssues: TypographyIssue[];
  ignoredTypographyIssues: TypographyIssue[];
  typographyIssueSummary: TypographyIssueSummary;
  spacingIssues: SpacingIssue[];
  ignoredSpacingIssues: SpacingIssue[];
  spacingIssueSummary: SpacingIssueSummary;
  radiusIssues: RadiusIssue[];
  ignoredRadiusIssues: RadiusIssue[];
  radiusIssueSummary: RadiusIssueSummary;
  alignmentIssues: AlignmentIssue[];
  ignoredAlignmentIssues: AlignmentIssue[];
  alignmentIssueSummary: AlignmentIssueSummary;
}

export type PluginToUiMessage =
  | {
      type: "plugin-ready";
      message: string;
    }
  | {
      type: "inspection-result";
      result: InspectionResult;
    }
  | {
      type: "inspection-error";
      messages: CheckMessage[];
    }
  | {
      type: "focus-node-result";
      success: boolean;
      message: string;
    }
  | {
      type: "settings-loaded";
      settings: QaSettings;
    }
  | {
      type: "settings-saved";
      settings: QaSettings;
      message: string;
    }
  | {
      type: "settings-reset";
      settings: QaSettings;
      message: string;
    }
  | {
      type: "settings-error";
      settings: QaSettings;
      message: string;
    };

export type UiToPluginMessage =
  | {
      type: "start-inspection";
    }
  | {
      type: "focus-node";
      nodeId: string;
    }
  | {
      type: "get-settings";
    }
  | {
      type: "save-settings";
      settings: QaSettings;
    }
  | {
      type: "reset-settings";
    }
  | {
      type: "ignore-issue";
      ignoreKey: string;
    }
  | {
      type: "restore-issue";
      ignoreKey: string;
    };
