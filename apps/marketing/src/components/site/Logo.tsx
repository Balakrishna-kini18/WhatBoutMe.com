import Image from "next/image";
import { cn } from "@/lib/utils";

export default function Logo({
  tone = "dark",
  className = "",
}: {
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <Image
      src={`/brand/logo-${tone}.png`}
      alt="whatboutme"
      width={776}
      height={103}
      priority
      // cn lets a caller's height replace the default instead of fighting it
      className={cn("h-5 w-auto", className)}
    />
  );
}
