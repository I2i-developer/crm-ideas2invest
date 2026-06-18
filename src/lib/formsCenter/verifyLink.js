const DEFAULT_TIMEOUT_MS = 8000;

function classifyStatus(status) {
  if (status >= 200 && status < 300) return "healthy";
  if (status >= 300 && status < 400) return "redirected";
  if ([401, 403, 429].includes(status)) return "unknown";
  if (status >= 400) return "broken";
  return "unknown";
}

async function requestUrl(url, method, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      redirect: "manual",
      signal: controller.signal,
      headers:
        method === "GET"
          ? { Range: "bytes=0-0", "User-Agent": "Ideas2Invest-Forms-Link-Checker/1.0" }
          : { "User-Agent": "Ideas2Invest-Forms-Link-Checker/1.0" },
    });
    await response.body?.cancel().catch(() => {});
    return { status: response.status, verificationStatus: classifyStatus(response.status) };
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyFormsLink(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { verificationStatus: "broken", httpStatus: null, error: "Invalid URL" };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { verificationStatus: "broken", httpStatus: null, error: "Unsupported URL protocol" };
  }

  try {
    const headResult = await requestUrl(parsed.toString(), "HEAD", timeoutMs);
    if (![403, 405, 429].includes(headResult.status)) {
      return {
        verificationStatus: headResult.verificationStatus,
        httpStatus: headResult.status,
        error: null,
      };
    }
  } catch {
    // Some official sites reject HEAD requests. A minimal GET is the fallback.
  }

  try {
    const getResult = await requestUrl(parsed.toString(), "GET", timeoutMs);
    return {
      verificationStatus: getResult.verificationStatus,
      httpStatus: getResult.status,
      error: null,
    };
  } catch (error) {
    return {
      verificationStatus: "unknown",
      httpStatus: null,
      error: error?.name === "AbortError" ? "Verification timed out" : "Verification request failed",
    };
  }
}
