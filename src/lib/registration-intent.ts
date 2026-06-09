export type RegistrationRoleIntent = "freelancer" | "company_user";

export function safeAuthCallbackUrl(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "";
}

export function loginHref(callbackUrl: string) {
  const safeCallbackUrl = safeAuthCallbackUrl(callbackUrl);
  if (safeCallbackUrl && safeCallbackUrl !== "/") {
    return `/login?${new URLSearchParams({ callbackUrl: safeCallbackUrl }).toString()}`;
  }
  return "/login";
}

export function loginErrorUrl(callbackUrl: string) {
  const params = new URLSearchParams({ error: "CredentialsSignin" });
  const safeCallbackUrl = safeAuthCallbackUrl(callbackUrl);
  if (safeCallbackUrl && safeCallbackUrl !== "/") {
    params.set("callbackUrl", safeCallbackUrl);
  }
  return `/login?${params.toString()}`;
}

export function registrationRoleIntent(callbackUrl: string): RegistrationRoleIntent {
  if (callbackUrl.startsWith("/company")) return "company_user";
  return "freelancer";
}
