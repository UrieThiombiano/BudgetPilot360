import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, type LucideProps } from "lucide-react";

/** Bloc de chargement (shimmer) — à composer en skeletons d'écran. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden rounded-lg bg-surface-2 ${className}`}
    >
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-black/[0.04] to-transparent dark:via-white/[0.06]" />
    </div>
  );
}

/** Skeleton d'une carte (cadre réel + lignes en shimmer) — évite le saut de layout. */
export function CardSkeleton({ lines = 2, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`card p-5 ${className}`}>
      <Skeleton className="h-3 w-24" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`mt-3 h-5 ${i % 2 === 0 ? "w-32" : "w-20"}`} />
      ))}
    </div>
  );
}

/** Bandeau d'erreur standard — role=alert, icône + tokens danger. */
export function ErrorBanner({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink ${className}`}
    >
      <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/** Bandeau de succès standard — role=status, icône + tokens succès. */
export function SuccessBanner({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success-ink ${className}`}
    >
      <CheckCircle2 size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/**
 * État vide invitant à agir : icône douce + titre + explication + action facultative.
 * Un écran vide est une invitation, pas un constat.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}: {
  icon: ComponentType<LucideProps>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`card flex flex-col items-center px-6 py-12 text-center ${className}`}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
        <Icon size={22} strokeWidth={1.75} />
      </span>
      <p className="mt-4 font-display text-base font-semibold text-fg">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-fg-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
