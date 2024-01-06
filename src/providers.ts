import { makeProviders, makeSimpleProxyFetcher, makeStandardFetcher, targets, Fetcher as RealFetcher } from "@movie-web/providers";
import { Context, Env } from "hono";

const specialDomains = ["showbox.shegu.net", "mbpapi.shegu.net"]
const standardFetcher = makeStandardFetcher(fetch);

export function getProviders(context: Context<Env>) {
  const proxyUrl = (context.env?.PROXY_URL as string | undefined) ?? '';

  const fetcher: RealFetcher = (u,ops) => {
    const url = new URL(u);
    if (specialDomains.includes(url.hostname) && !!proxyUrl)
      return makeSimpleProxyFetcher(proxyUrl, fetch)(u, ops);
    return standardFetcher(u, ops);
  };

  return makeProviders({
    fetcher,
    target: targets.BROWSER,
  });
}
