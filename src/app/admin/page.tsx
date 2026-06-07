import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  await requireRole("ADMIN"); // defense in depth — layout checks too

  const [users, sellers, listings, orders] = await Promise.all([
    db.user.count(),
    db.sellerProfile.count(),
    db.listing.count(),
    db.order.count(),
  ]);

  const stats = [
    { label: "Users", value: users },
    { label: "Sellers", value: sellers },
    { label: "Listings", value: listings },
    { label: "Orders", value: orders },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin panel</h1>
        <p className="text-sm text-muted-foreground">
          KYC review, disputes and moderation tools arrive in Step 15.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} size="sm">
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-2xl font-bold">{s.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Platform status</CardTitle>
          <CardDescription>
            Foundation phase — auth + roles live (Step 03). Next: design system
            (Step 04), then catalog and listings.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Tip: promote a user to admin with{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            npx prisma studio
          </code>{" "}
          → User → role → ADMIN (proper role management lands in Step 15).
        </CardContent>
      </Card>
    </div>
  );
}
