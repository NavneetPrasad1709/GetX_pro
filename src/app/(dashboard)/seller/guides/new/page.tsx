import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { GuideEditorForm } from "@/components/community/guide-editor-form";

export const metadata: Metadata = { title: "New guide", robots: { index: false } };
export const dynamic = "force-dynamic";

const VETERAN_SALES = 500;

export default async function NewGuidePage() {
  const session = await requireUser();
  const [games, profile] = await Promise.all([
    db.game.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.sellerProfile.findUnique({ where: { userId: session.user.id }, select: { totalSales: true } }),
  ]);
  const autoPublish = (profile?.totalSales ?? 0) >= VETERAN_SALES;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <Link href="/seller/guides" className="text-sm text-primary hover:underline">
          ← My guides
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Write a guide</h1>
      </div>
      <GuideEditorForm games={games} autoPublish={autoPublish} />
    </div>
  );
}
