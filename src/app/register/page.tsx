import { registerUser } from "@/lib/actions";
import { Shell, TopNav, Card, TextField, SelectField } from "@/components/ui";

export default function RegisterPage() {
  return (
    <Shell>
      <TopNav />
      <div className="mx-auto grid min-h-[calc(100vh-65px)] max-w-md place-items-center px-5 py-10">
        <Card className="w-full">
          <h1 className="text-2xl font-semibold">アカウント登録</h1>
          <form action={registerUser} className="mt-5 grid gap-4">
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
