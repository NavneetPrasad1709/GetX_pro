import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { listPendingKyc } from "@/server/services/kyc";
import { KycReviewActions } from "@/components/admin/kyc-review-actions";

export const metadata: Metadata = { title: "KYC — Admin" };

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const DOC_LABEL: Record<string, string> = {
  PASSPORT: "Passport",
  NATIONAL_ID: "National ID",
  DRIVING_LICENSE: "Driving licence",
};

export default async function AdminKycPage() {
  await requireRole("ADMIN");
  const queue = await listPendingKyc();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">KYC review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open each document via a short-lived signed link, then approve or
          reject. Every view and decision is audit-logged.
        </p>
      </div>

      {queue.length === 0 ? (
        <p className="rounded-lg border border-border bg-card/40 p-4 text-sm text-muted-foreground">
          No pending verifications. 🎉
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {queue.map((k) => (
            <li
              key={k.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 min-[761px]:flex-row min-[761px]:items-center min-[761px]:justify-between"
            >
              <div className="min-w-0">
                <p className="font-semibold">{k.sellerName}</p>
                <p className="mt-0.5 text-xs text-faint">
                  {DOC_LABEL[k.docType] ?? k.docType} ·{" "}
                  {dateFmt.format(new Date(k.createdAt))}
                </p>
              </div>
              <KycReviewActions submissionId={k.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
