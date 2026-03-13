const DEFAULT_RESOURCE_CONFIG = {
  schemaUrl: "./tooling/frs-schema.json",
  grammarUrl: "./tooling/frs-flow.pegjs",
};

function normalizeUrl(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  // Allow relative paths (./  ../  /) and https:// only — block javascript:, data:, etc.
  if (trimmed && !/^(https?:\/\/|\.\.?\/|\/(?!\/))/.test(trimmed)) return "";
  return trimmed;
}

export function getResourceConfig() {
  const runtimeConfig = globalThis?.FRS_APP_CONFIG ?? {};

  const configuredSchema = normalizeUrl(runtimeConfig.schemaUrl);
  const configuredGrammar = normalizeUrl(runtimeConfig.grammarUrl);

  return {
    schemaUrl: configuredSchema || DEFAULT_RESOURCE_CONFIG.schemaUrl,
    grammarUrl: configuredGrammar || DEFAULT_RESOURCE_CONFIG.grammarUrl,
    fallbackSchemaUrl: DEFAULT_RESOURCE_CONFIG.schemaUrl,
    fallbackGrammarUrl: DEFAULT_RESOURCE_CONFIG.grammarUrl,
  };
}
