import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function initials(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || "";
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

type Props = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  size?: "sm" | "default" | "lg";
  className?: string;
};

/** App-wide avatar: image when present, brand initials fallback otherwise. */
export function UserAvatar({ name, email, image, size = "default", className }: Props) {
  return (
    <Avatar size={size} className={className}>
      {image ? <AvatarImage src={image} alt={name ?? ""} /> : null}
      {/* text-primary-hover (#5e89ff, in-palette): plain text-primary is
          4.06:1 on the tinted bg — below WCAG AA 4.5:1 for initials this
          small. The lighter hover tone passes (≈4.7:1) on every surface. */}
      <AvatarFallback className="bg-primary/15 font-semibold text-primary-hover">
        {initials(name, email)}
      </AvatarFallback>
    </Avatar>
  );
}
