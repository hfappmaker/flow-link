import Link from "next/link";
import { registerUser } from "@/lib/actions";
import { RegisterForm } from "@/app/register/register-form";
import { Shell, TopNav, Card } from "@/components/ui";
import { loginHref, registrationRoleIntent, safeAuthCallbackUrl } from "@/lib/registration-intent";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const params = await searchParams;
  const callbackUrl = safeAuthCallbackUrl(params.callbackUrl ?? "");
  const roleIntent = registrationRoleIntent(callbackUrl);
  const duplicateEmail = params.error === "email-exists";
  const duplicateEmailLoginHref = loginHref(callbackUrl);

  return (
    <Shell>
      <TopNav activeSection="register" loginCallbackUrl={callbackUrl} registerCallbackUrl={callbackUrl} />
      <div className="mx-auto grid max-w-md px-4 pb-8 pt-4 sm:px-5 sm:pb-12 sm:pt-12 lg:pt-16">
        <Card className="w-full max-[480px]:p-4">
          <h1 className="text-xl font-semibold sm:text-2xl">アカウント登録</h1>
          {duplicateEmail && (
            <p className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              このメールアドレスはすでに登録されています。
              <Link className="font-semibold underline underline-offset-2" href={duplicateEmailLoginHref}>ログイン</Link>
              するか、別のメールアドレスを使用してください。
            </p>
          )}
          <RegisterForm action={registerUser} callbackUrl={callbackUrl} initialRole={roleIntent} />
        </Card>
      </div>
    </Shell>
  );
}
