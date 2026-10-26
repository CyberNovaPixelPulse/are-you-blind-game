import Link from "next/link";

export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`text-center text-xs leading-6 text-zinc-500 dark:text-zinc-400 ${className}`}>
      <p className="mx-auto max-w-prose text-balance">
        © 2026 AreYouBlind
        <span aria-hidden="true"> · </span>
        <Link href="/guidelines" className="transition-colors hover:text-zinc-600 dark:hover:text-zinc-300">
          出題規範
        </Link>
        <span aria-hidden="true"> · </span>
        <Link href="/terms" className="transition-colors hover:text-zinc-600 dark:hover:text-zinc-300">
          服務條款與免責聲明
        </Link>
      </p>
    </footer>
  );
}
