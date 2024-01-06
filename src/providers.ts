import { makeProviders, makeSimpleProxyFetcher, makeStandardFetcher, targets, Fetcher as RealFetcher } from "@movie-web/providers";
import { Context, Env } from "hono";

const standardFetcher = makeStandardFetcher(fetch);

export function getProviders(context: Context<Env>) {
  const proxyUrl = (context.env?.PROXY_URL as string | undefined) ?? '';
  const specialDomainsEnv = (context.env?.PROXIED_DOMAINS as string | undefined) ?? '';
  const specialDomains = specialDomainsEnv.split(",").map(v=>v.trim()).filter(v=>v.length>0);

  const fetcher: RealFetcher = (u,ops) => {
    let url: URL | null = null;
    try {
      if (ops.baseUrl) {
        const baseUrl = ops.baseUrl.endsWith("/") ? ops.baseUrl.slice(0, -1) : ops.baseUrl;
        const path = u.startsWith("/") ? u : u.slice(0, -1);
        url = new URL(baseUrl + path);
      } else {
        url = new URL(u);
      }
      if (specialDomains.includes(url.hostname) && !!proxyUrl)
        return makeSimpleProxyFetcher(proxyUrl, fetch)(u, ops);
    } catch {
      return standardFetcher(u, ops);
    }
    
    return standardFetcher(u, ops);
  };

  return makeProviders({
    fetcher,
    target: targets.BROWSER,
  });
}
