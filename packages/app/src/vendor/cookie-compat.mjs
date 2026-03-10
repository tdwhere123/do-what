function decodeCookieValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parse(cookieHeader = '') {
  const result = Object.create(null);

  for (const entry of cookieHeader.split(';')) {
    const trimmed = entry.trim();

    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const name = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!name || result[name] !== undefined) {
      continue;
    }

    result[name] = decodeCookieValue(value);
  }

  return result;
}

export const parseCookie = parse;

export function serialize(name, value, options = {}) {
  const segments = [`${name}=${encodeURIComponent(value ?? '')}`];

  if (options.maxAge !== undefined) {
    segments.push(`Max-Age=${Math.floor(options.maxAge)}`);
  }

  if (options.domain) {
    segments.push(`Domain=${options.domain}`);
  }

  if (options.path) {
    segments.push(`Path=${options.path}`);
  }

  if (options.expires instanceof Date) {
    segments.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.httpOnly) {
    segments.push('HttpOnly');
  }

  if (options.secure) {
    segments.push('Secure');
  }

  if (options.partitioned) {
    segments.push('Partitioned');
  }

  if (options.sameSite) {
    const sameSite = String(options.sameSite);
    segments.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`);
  }

  return segments.join('; ');
}

export const stringifySetCookie = serialize;

export function stringifyCookie(cookie, options = {}) {
  return Object.entries(cookie)
    .map(([name, value]) => serialize(name, value, options))
    .join('; ');
}

export function parseSetCookie(setCookieHeader = '') {
  const [nameValuePair, ...attributes] = setCookieHeader.split(';');
  const separatorIndex = nameValuePair.indexOf('=');

  if (separatorIndex === -1) {
    return null;
  }

  const cookie = {
    name: nameValuePair.slice(0, separatorIndex).trim(),
    value: decodeCookieValue(nameValuePair.slice(separatorIndex + 1).trim()),
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
      cookie.expires = new Date(value);
      continue;
    }

    if (key === 'max-age') {
      cookie.maxAge = Number.parseInt(value, 10);
      continue;
    }

    if (key === 'secure') {
      cookie.secure = true;
      continue;
    }

    if (key === 'httponly') {
      cookie.httpOnly = true;
      continue;
    }

    if (key === 'samesite') {
      cookie.sameSite = value;
      continue;
    }

    if (key === 'partitioned') {
      cookie.partitioned = true;
      continue;
    }

    if (key) {
      cookie[key] = value || true;
    }
  }

  return cookie;
}

export default {
  parse,
  parseCookie,
  serialize,
  stringifyCookie,
  stringifySetCookie,
  parseSetCookie,
};
