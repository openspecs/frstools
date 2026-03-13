/**
 * Lightweight FRS frontmatter validator.
 * Checks required fields, enum constraints, and id/depends_on patterns.
 * Returns an array of warning strings. Empty array = valid.
 */

const REQUIRED_FIELDS = ["id", "user", "context", "trigger", "user_outcome"];

const ENUM_FIELDS = {
  priority: ["critical", "high", "medium", "low", "skip"],
  status: ["draft", "approved", "implemented"],
};

const ID_PATTERN = /^[A-Z][A-Z0-9-]+$/;

export function validateFrontmatter(data, schema) {
  // If a live schema is supplied, derive required/enum rules from it;
  // otherwise fall back to the hard-coded rules above.
  const required = schema?.required ?? REQUIRED_FIELDS;
  const enumRules = buildEnumRules(schema);

  const warnings = [];

  for (const field of required) {
    const value = data[field];
    if (value === undefined || value === null || value === "") {
      warnings.push(`Missing required field: ${field}`);
    }
  }

  for (const [field, allowed] of Object.entries(enumRules)) {
    const value = data[field];
    if (value !== undefined && !allowed.includes(value)) {
      warnings.push(`Invalid value for ${field}: "${value}" (allowed: ${allowed.join(", ")})`);
    }
  }

  if (data.id && !ID_PATTERN.test(data.id)) {
    warnings.push(`id "${data.id}" does not match required pattern ^[A-Z][A-Z0-9-]+$`);
  }

  if (Array.isArray(data.depends_on)) {
    for (const dep of data.depends_on) {
      if (!ID_PATTERN.test(dep)) {
        warnings.push(`depends_on entry "${dep}" does not match required pattern`);
      }
    }
  }

  return warnings;
}

function buildEnumRules(schema) {
  if (!schema?.properties) {
    return ENUM_FIELDS;
  }

  const rules = {};
  for (const [field, def] of Object.entries(schema.properties)) {
    if (Array.isArray(def.enum)) {
      rules[field] = def.enum;
    }
  }
  return Object.keys(rules).length ? rules : ENUM_FIELDS;
}
