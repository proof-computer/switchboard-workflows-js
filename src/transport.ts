export interface SwitchboardTransportSecurityOptions {
  allowInsecureHttp?: boolean;
}

export function requireSecureSwitchboardUrl(
  rawUrl: string | URL,
  label: string,
  options: SwitchboardTransportSecurityOptions = {}
): URL {
  let url: URL;
  try {
    url = rawUrl instanceof URL ? new URL(rawUrl.toString()) : new URL(rawUrl);
  } catch (error) {
    throw new Error(`${label} must be a valid URL`, { cause: error });
  }

  if (url.protocol === "https:") {
    return url;
  }
  if (url.protocol === "http:" && options.allowInsecureHttp === true) {
    return url;
  }
  if (url.protocol === "http:") {
    throw new Error(`${label} must use https://; set allowInsecureHttp only for controlled local tests or labs`);
  }
  throw new Error(`${label} must use https://; unsupported URL protocol ${url.protocol}`);
}

export function secureSwitchboardUrl(
  pathname: string,
  baseUrl: string | URL,
  label: string,
  options: SwitchboardTransportSecurityOptions = {}
): URL {
  return new URL(pathname, requireSecureSwitchboardUrl(baseUrl, label, options));
}
