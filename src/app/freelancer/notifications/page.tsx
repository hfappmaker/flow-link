import { auth } from "@/lib/auth";
import { markNotificationRead } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { Shell, TopNav, PageHeader, Card, EmptyState, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await auth();
  const notifications = await prisma.notification.findMany({
    where: { userId: session!.user.id },
    orderBy: { createdAt: "desc" },
  });
  return (
    <Shell>
      <TopNav sessionRole={session?.user?.role} />
      <div className="mx-auto max-w-4xl px-5 py-8">
        <PageHeader title="通知" />
        <div className="mt-6 grid gap-4">
          {notifications.map((notification) => (
            <Card key={notification.id}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <StatusBadge tone={notification.readAt ? "neutral" : "good"}>{notification.readAt ? "既読" : "未読"}</StatusBadge>
                  <h2 className="mt-2 font-semibold">{notification.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">{notification.body}</p>
                  <p className="mt-2 text-xs text-stone-500">{formatDateTime(notification.createdAt)}</p>
                </div>
                {!notification.readAt && (
                  <form action={markNotificationRead}>
                    <input type="hidden" name="notificationId" value={notification.id} />
                    <button className="btn btn-secondary">既読にする</button>
                  </form>
                )}
              </div>
            </Card>
          ))}
          {notifications.length === 0 && (
            <EmptyState title="通知はまだありません。" description="応募結果や面談調整の更新が届くと、ここに表示されます。" />
          )}
        </div>
      </div>
    </Shell>
  );
}
