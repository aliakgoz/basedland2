declare const __BASEDLAND_WS_URL__: string;

function backendOriginFromWsUrl(): string {
  if (!__BASEDLAND_WS_URL__) {
    return window.location.origin;
  }

  try {
    const url = new URL(__BASEDLAND_WS_URL__);
    if (url.protocol === "ws:") {
      url.protocol = "http:";
    } else if (url.protocol === "wss:") {
      url.protocol = "https:";
    }
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.origin;
  } catch {
    return window.location.origin;
  }
}

const backendOrigin = backendOriginFromWsUrl();

export function backendUrl(path: string): string {
  return new URL(path, `${backendOrigin}/`).toString();
}

export function sameBackendOrigin(): boolean {
  return backendOrigin === window.location.origin;
}

