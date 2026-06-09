export type RegistrationRoleIntent = "freelancer" | "company_user";

export function safeAuthCallbackUrl(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "";
}

export function registrationRoleIntent(callbackUrl: string): RegistrationRoleIntent {
  if (callbackUrl.startsWith("/company")) return "company_user";
  return "freelancer";
}
