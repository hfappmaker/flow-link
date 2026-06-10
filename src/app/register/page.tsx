import Link from "next/link";
import { registerUser } from "@/lib/actions";
import { Shell, TopNav, Card, TextField, SelectField, SubmitButton } from "@/components/ui";
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
      <div className="mx-auto grid max-w-md px-5 pb-12 pt-8 sm:pt-12 lg:pt-16">
        <Card className="w-full">
          <h1 className="text-2xl font-semibold">アカウント登録</h1>
          {duplicateEmail && (
            <p className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              このメールアドレスはすでに登録されています。
              <Link className="font-semibold underline underline-offset-2" href={duplicateEmailLoginHref}>ログイン</Link>
              するか、別のメールアドレスを使用してください。
            </p>
          )}
          <form action={registerUser} className="mt-5 grid gap-4">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <TextField name="name" label="氏名または企業名" required />
            <TextField name="email" label="メールアドレス" type="email" required />
            <TextField name="password" label="パスワード" type="password" required minLength={8} />
            <SelectField name="role" label="種別" defaultValue={roleIntent}>
              <option value="freelancer">フリーランス</option>
              <option value="company_user">企業ユーザー</option>
            </SelectField>
            <SubmitButton className="btn btn-primary" pendingLabel="登録中">登録して開始</SubmitButton>
          </form>
        </Card>
      </div>
    </Shell>
  );
}
