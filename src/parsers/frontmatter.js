/**
 * Splits a raw .md string into YAML frontmatter and the Flow body.
 * Returns { frontmatter: string, body: string } or throws a SplitError.
 */

export class SplitError extends Error {}

const DELIMITER = "---";

export function splitDocument(rawText) {
  const lines = rawText.replace(/\r\n/g, "\n").split("\n");

  if (lines[0].trim() !== DELIMITER) {
    throw new SplitError("Missing frontmatter");
  }

  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === DELIMITER,
  );

  if (closingIndex === -1) {
    throw new SplitError("Missing frontmatter");
  }

  const frontmatter = lines.slice(1, closingIndex).join("\n");
  const body = lines.slice(closingIndex + 1).join("\n").trimStart();

  return { frontmatter, body };
}

/**
 * Parses YAML frontmatter text into a plain object using js-yaml (loaded globally).
 * Throws on parse failure so the caller can show an appropriate error.
 */
export function parseFrontmatter(yamlText) {
  if (typeof globalThis.jsyaml === "undefined") {
    throw new Error("js-yaml not loaded");
  }
  return globalThis.jsyaml.load(yamlText, { schema: globalThis.jsyaml.CORE_SCHEMA }) ?? {};
}
