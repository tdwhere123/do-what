function splitSetCookieString(header) {
  const values = Array.isArray(header) ? header : [header];
  const result = [];

  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0) {
      continue;
    }

    let start = 0;
    let inExpiresAttribute = false;

    for (let index = 0; index < value.length; index += 1) {
      const current = value[index];
      const next = value[index + 1];

      if (value.slice(index, index + 8).toLowerCase() === 'expires=') {
        inExpiresAttribute = true;
      }

      if (inExpiresAttribute && current === ';') {
        inExpiresAttribute = false;
      }

      if (current === ',' && next === ' ' && !inExpiresAttribute) {
        result.push(value.slice(start, index));
        start = index + 2;
      }
    }

    result.push(value.slice(start));
  }

  return result.filter(Boolean);
}

export function splitCookiesString(header) {
  return splitSetCookieString(header);
}

export function parseString(setCookieValue) {
  const [nameValuePair, ...attributes] = String(setCookieValue ?? '').split(';');
  const separatorIndex = nameValuePair.indexOf('=');

  if (separatorIndex === -1) {
    return null;
  }

  const parsed = {
    name: nameValuePair.slice(0, separatorIndex).trim(),
    value: nameValuePair.slice(separatorIndex + 1).trim(),
  };

  for (const attribute of attributes) {
    const trimmed = attribute.trim();

    if (!trimmed) {
      continue;
    }

    const [rawKey, ...rawValue] = trimmed.split('=');
    const key = rawKey.toLowerCase();
    const value = rawValue.join('=').trim();

    if (key === 'expires') {
      parsed.expires = new Date(value);
      continue;
    }

    if (key === 'max-age') {
      parsed.maxAge = Number.parseInt(value, 10);
      continue;
    }

    if (key === 'secure') {
      parsed.secure = true;
      continue;
    }

    if (key === 'httponly') {
      parsed.httpOnly = true;
      continue;
    }

    if (key === 'samesite') {
      parsed.sameSite = value;
      continue;
    }

    if (key === 'partitioned') {
      parsed.partitioned = true;
      continue;
    }

    if (key) {
      parsed[key] = value || true;
    }
  }

  return parsed;
}

export function parse(header) {
  return splitSetCookieString(header).map((value) => parseString(value)).filter(Boolean);
}

export default {
  parse,
  parseString,
  splitCookiesString,
};
