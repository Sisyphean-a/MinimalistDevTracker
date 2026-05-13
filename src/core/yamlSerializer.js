function formatScalar(value) {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(String(value));
}

function serializeNode(value, indent) {
  if (Array.isArray(value)) {
    return serializeArray(value, indent);
  }
  if (value && typeof value === 'object') {
    return serializeObject(value, indent);
  }
  return `${'  '.repeat(indent)}${formatScalar(value)}`;
}

function serializeArray(values, indent) {
  if (values.length === 0) {
    return `${'  '.repeat(indent)}[]`;
  }

  return values.map((value) => {
    if (value && typeof value === 'object') {
      const nested = serializeNode(value, indent + 1);
      return `${'  '.repeat(indent)}-\n${nested}`;
    }
    return `${'  '.repeat(indent)}- ${formatScalar(value)}`;
  }).join('\n');
}

function serializeObject(value, indent) {
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return `${'  '.repeat(indent)}{}`;
  }

  return entries.map(([key, current]) => {
    if (current && typeof current === 'object') {
      return `${'  '.repeat(indent)}${key}:\n${serializeNode(current, indent + 1)}`;
    }
    return `${'  '.repeat(indent)}${key}: ${formatScalar(current)}`;
  }).join('\n');
}

function toYaml(value) {
  return `${serializeNode(value, 0)}\n`;
}

module.exports = {
  toYaml
};
