import type { ReactNode } from "react";

/** Bloc de chargement animé (pulse), à composer en skeletons d'écran. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-800 ${className}`}
    />
  );
}

/** Skeleton d'une carte (cadre réel + lignes en pulse) — évite le saut de layout. */
export function CardSkeleton({ lines = 2, className = "" }: { lines?: number; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950 ${className}`}
    >
      <Skeleton className="h-3 w-24" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`mt-3 h-5 ${i % 2 === 0 ? "w-32" : "w-20"}`} />
      ))}
    </div>
  );
}

/** Bandeau d'erreur standard — role=alert pour être annoncé aux lecteurs d'écran. */
export function ErrorBanner({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p
      role="alert"
      className={`rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300 ${className}`}
    >
      {children}
    </p>
  );
}

/** Bandeau de succès standard — role=status (annonce non intrusive). */
export function SuccessBanner({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p
      role="status"
      className={`rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 ${className}`}
    >
      {children}
    </p>
  );
}
