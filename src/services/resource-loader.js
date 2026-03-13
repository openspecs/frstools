async function fetchText(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

export async function fetchWithFallback(primaryUrl, fallbackUrl) {
  if (!primaryUrl) {
    const fallbackText = await fetchText(fallbackUrl);
    return { content: fallbackText, sourceUrl: fallbackUrl, usedFallback: true };
  }

  try {
    const primaryText = await fetchText(primaryUrl);
    return { content: primaryText, sourceUrl: primaryUrl, usedFallback: false };
  } catch (error) {
    if (primaryUrl === fallbackUrl) {
      throw error;
    }

    const fallbackText = await fetchText(fallbackUrl);
    return { content: fallbackText, sourceUrl: fallbackUrl, usedFallback: true };
  }
}

export async function loadSchema(config) {
  const schemaResult = await fetchWithFallback(config.schemaUrl, config.fallbackSchemaUrl);
  return {
    ...schemaResult,
    data: JSON.parse(schemaResult.content),
  };
}

export async function loadGrammar(config) {
  return fetchWithFallback(config.grammarUrl, config.fallbackGrammarUrl);
}
