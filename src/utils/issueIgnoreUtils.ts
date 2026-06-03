const IGNORED_ISSUES_STORAGE_KEY = "mobile-ui-qa-inspector-ignored-issues";

export async function loadIgnoredIssueKeys(): Promise<Set<string>> {
  try {
    const storedValue = await figma.clientStorage.getAsync(IGNORED_ISSUES_STORAGE_KEY);

    if (!Array.isArray(storedValue)) {
      return new Set();
    }

    return new Set(storedValue.filter((key) => typeof key === "string"));
  } catch {
    return new Set();
  }
}

export async function saveIgnoredIssueKeys(ignoreKeys: Set<string>): Promise<void> {
  await figma.clientStorage.setAsync(IGNORED_ISSUES_STORAGE_KEY, Array.from(ignoreKeys));
}
