/**
 * Uses the pre-compiled frs-flow-parser.js (frsFlowParser global) to parse flow sections.
 * No runtime grammar compilation — avoids unsafe-eval CSP requirement.
 */

export class FlowParseError extends Error {}

export function parseFlow(bodyText) {
  if (typeof globalThis.frsFlowParser === "undefined") {
    throw new Error("frsFlowParser not loaded");
  }
  const parser = globalThis.frsFlowParser;

  // Strip any content before the first "Flow:" line (e.g. markdown headings, comments)
  const flowStart = bodyText.search(/^Flow:/m);
  const normalizedBody = flowStart > 0 ? bodyText.slice(flowStart) : bodyText;

  let result;
  try {
    result = parser.parse(normalizedBody);
  } catch (err) {
    throw new FlowParseError(err.message ?? "Parse error");
  }

  // Post-process: parse the raw validate YAML body string via js-yaml
  if (result.validate !== null && typeof result.validate === "string") {
    try {
      const parsed = globalThis.jsyaml?.load("Validate:" + result.validate, { schema: globalThis.jsyaml?.CORE_SCHEMA });
      result.validate = parsed?.Validate ?? null;
    } catch {
      result.validate = null;
    }
  }

  return result;
}


