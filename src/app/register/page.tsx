import { registerUser } from "@/lib/actions";
import { Shell, TopNav, Card, TextField, SelectField } from "@/components/ui";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const params = await searchParams;
  const callbackUrl = safeRegisterCallbackUrl(params.callbackUrl ?? "");

  return (
    <Shell>
      <TopNav />
      <div className="mx-auto grid min-h-[calc(100vh-65px)] max-w-md place-items-center px-5 py-10">
        <Card className="w-full">
          <h1 className="text-2xl font-semibold">アカウント登録</h1>
          {params.error === "email-exists" && (
            <p className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              このメールアドレスはすでに登録されています。ログインするか、別のメールアドレスを使用してください。
            </p>
          )}
          <form action={registerUser} className="mt-5 grid gap-4">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <TextField name="name" label="氏名または企業名" required />
            <TextField name="email" label="メールアドレス" type="email" required />
            <TextField name="password" label="パスワード" type="password" required minLength={8} />
            <SelectField name="role" label="種別" defaultValue="freelancer">
              <option value="freelancer">フリーランス</option>
              <option value="company_user">企業ユーザー</option>
            </SelectField>
            <button className="btn btn-primary" type="submit">登録して開始</button>
          </form>
        </Card>
      </div>
    </Shell>
  );
}

function safeRegisterCallbackUrl(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "";
}
