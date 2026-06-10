"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Search box that pushes ?q= to the URL (admin list pages re-query server-side). */
export function AdminSearch({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <form onSubmit={submit} className="relative max-w-sm">
      <SearchIcon
        className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint"
        aria-hidden="true"
      />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label="Search"
        className="pl-9"
      />
    </form>
  );
}
