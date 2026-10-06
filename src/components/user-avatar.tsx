"use client";

import { useEffect, useState } from "react";

function usableAvatarUrl(src: string | null | undefined) {
  if (!src?.trim()) return null;
  try {
    const url = new URL(src);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function initial(name: string) {
  const letter = [...name.trim()][0];
  return letter || "玩";
}

export function UserAvatar({
  name,
  src,
  className = "",
  ring,
}: {
  name: string;
  src: string | null;
  className?: string;
  ring?: string;
}) {
  const url = usableAvatarUrl(src);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [url]);

  const showImage = Boolean(url) && !imageError;
  const face = (
    <span
      className={`inline-flex items-center justify-center overflow-hidden rounded-full border border-amber-300/80 bg-zinc-900 font-semibold text-amber-100 ${className}`}
    >
      {showImage ? (
        // Google 頭像不走 next/image，避免每個帳號網域都要另開遠端設定。
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url ?? ""}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        initial(name)
      )}
    </span>
  );

  if (!ring) return face;
  return <span className={ring}>{face}</span>;
}
