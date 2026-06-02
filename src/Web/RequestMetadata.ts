export function GetRequestIpAddress(Request: Request): string {
  const ForwardedFor = Request.headers.get("x-forwarded-for");

  if (ForwardedFor) {
    const FirstForwardedAddress = ForwardedFor.split(",")[0]?.trim();

    if (FirstForwardedAddress) {
      return FirstForwardedAddress;
    }
  }

  const HeaderIpAddress =
    Request.headers.get("x-real-ip") ??
    Request.headers.get("cf-connecting-ip") ??
    Request.headers.get("x-client-ip");

  return HeaderIpAddress?.trim() || "unknown";
}

export function GetRequestUserAgent(Request: Request): string {
  return Request.headers.get("user-agent")?.trim() || "unknown";
}
