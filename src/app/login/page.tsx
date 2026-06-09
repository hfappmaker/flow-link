import Link from "next/link";
import { loginUser } from "@/lib/actions";
import { Shell, TopNav, Card, TextField } from "@/components/ui";
import { safeAuthCallbackUrl } from "@/lib/registration-intent";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const params = await searchParams;
  const callbackUrl = safeAuthCallbackUrl(params.callbackUrl ?? "");
  const registerHref = callbackUrl ? { pathname: "/register", query: { callbackUrl } } : "/register";
  return (
    <Shell>
      <TopNav activeSection="login" registerCallbackUrl={callbackUrl} />
      <div className="mx-auto grid min-h-[calc(100vh-65px)] max-w-md place-items-center px-5 py-10">
        <Card className="w-full">
          <h1 className="text-2xl font-semibold">ログイン</h1>
          {params.error && <p className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">メールアドレスまたはパスワードが違います。</p>}
          <form action={loginUser} className="mt-5 grid gap-4">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <TextField name="email" label="メールアドレス" type="email" required />
            <TextField name="password" label="パスワード" type="password" required minLength={8} />
            <button className="btn btn-primary" type="submit">ログイン</button>
          </form>
          <p className="mt-4 text-sm text-stone-600">
            アカウントがない場合は <Link className="font-semibold text-emerald-700" href={registerHref}>登録</Link>
          </p>
        </Card>
      </div>
    </Shell>
  );
}
