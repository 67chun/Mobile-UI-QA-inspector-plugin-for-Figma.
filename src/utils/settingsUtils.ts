import type { QaSettings } from "../types";

const SETTINGS_STORAGE_KEY = "mobile-ui-qa-inspector-settings";
const CURRENT_SETTINGS_VERSION = 2;

export const DEFAULT_QA_SETTINGS: QaSettings = {
  settingsVersion: CURRENT_SETTINGS_VERSION,
  frameWidth: 375,
  pageHorizontalMargin: 16,
  minTinyTextSize: 10,
  smallTextWarningSize: 12,
  bodyTextReferenceSize: 14,
  spacingBaseUnit: 2,
  spacingTolerance: 1
};

export async function loadQaSettings(): Promise<QaSettings> {
  try {
    const storedSettings = await figma.clientStorage.getAsync(SETTINGS_STORAGE_KEY);
    return normalizeQaSettings(storedSettings);
  } catch {
    return { ...DEFAULT_QA_SETTINGS };
  }
}

export async function saveQaSettings(settings: Partial<QaSettings>): Promise<QaSettings> {
  const normalizedSettings = normalizeQaSettings(settings);
  await figma.clientStorage.setAsync(SETTINGS_STORAGE_KEY, normalizedSettings);
  return normalizedSettings;
}

export async function resetQaSettings(): Promise<QaSettings> {
  const defaultSettings = { ...DEFAULT_QA_SETTINGS };
  await figma.clientStorage.setAsync(SETTINGS_STORAGE_KEY, defaultSettings);
  return defaultSettings;
}

export function normalizeQaSettings(settings: unknown): QaSettings {
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

function isSettingsLike(value: unknown): value is Partial<QaSettings> {
  return typeof value === "object" && value !== null;
}

function readPositiveNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return fallback;
  }

  return numberValue;
}

function readSpacingBaseUnit(input: Partial<QaSettings>): number {
  const spacingBaseUnit = readPositiveNumber(input.spacingBaseUnit, DEFAULT_QA_SETTINGS.spacingBaseUnit);

  // Older local settings stored the former default value 4 without a version.
  // Treat that exact legacy default as the new v0.1 baseline: 2px.
  if (input.settingsVersion !== CURRENT_SETTINGS_VERSION && spacingBaseUnit === 4) {
    return DEFAULT_QA_SETTINGS.spacingBaseUnit;
  }

  return spacingBaseUnit;
}

function readNonNegativeNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return fallback;
  }

  return numberValue;
}
