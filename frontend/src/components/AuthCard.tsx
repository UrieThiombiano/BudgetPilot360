import type { ReactNode } from "react";
import { motion } from "framer-motion";

/** Cadre commun des écrans publics (login / signup). */
export default function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-900">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-sm"
      >
        <div className="mb-6 text-center">
          <span className="text-2xl font-bold text-slate-900 dark:text-white">
            BudgetPilot<span className="text-indigo-600">360</span>
          </span>
        </div>
        <div className="rounded-2xl bg-white p-8 shadow-lg dark:bg-slate-800">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          )}
          <div className="mt-6">{children}</div>
        </div>
      </motion.div>
    </div>
  );
}
