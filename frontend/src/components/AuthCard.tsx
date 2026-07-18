import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { PieChart, ShieldCheck, Sparkles } from "lucide-react";

/** Argument de valeur affiché sur le panneau de gauche (desktop). */
const VALUE_POINTS = [
  { icon: PieChart, title: "Recettes & dépenses réunies", desc: "Une vue unique sur l'argent qui entre et qui sort." },
  { icon: ShieldCheck, title: "Validé et tracé", desc: "Chaque dépense passe par une validation auditée." },
  { icon: Sparkles, title: "Un copilote qui lit vos chiffres", desc: "L'assistant IA répond sur vos données réelles." },
];

/**
 * Cadre commun des écrans publics (connexion, demande de compte, sans entreprise).
 * Mise en page premium en deux colonnes : panneau de marque + proposition de
 * valeur à gauche (desktop), carte d'action à droite.
 */
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
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1.05fr_1fr]">
      {/* Panneau de valeur (desktop) */}
      <div
        className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12"
        style={{
          background:
            "radial-gradient(120% 120% at 0% 0%, #6d28d9 0%, rgb(var(--accent)) 45%, #4338ca 100%)",
        }}
      >
        {/* halos décoratifs discrets */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/10 blur-3xl" />

        <div className="relative">
          <span className="font-display text-2xl font-bold tracking-tight text-white">
            BudgetPilot<span className="text-white/70">360</span>
          </span>
        </div>

        <div className="relative">
          <h2 className="max-w-md font-display text-4xl font-semibold leading-tight tracking-tight text-white">
            Le pilotage budgétaire de votre PME, enfin en clair.
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/75">
            Suivez vos recettes et vos dépenses, gardez la main sur chaque
            validation, et décidez sur des chiffres à jour — pas sur des tableurs
            éparpillés.
          </p>

          <ul className="mt-9 space-y-5">
            {VALUE_POINTS.map(({ icon: Icon, title: t, desc }, i) => (
              <motion.li
                key={t}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.1, duration: 0.4, ease: "easeOut" }}
                className="flex items-start gap-3.5"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/20">
                  <Icon size={18} strokeWidth={1.75} className="text-white" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{t}</p>
                  <p className="text-[13px] leading-snug text-white/65">{desc}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">
          BudgetPilot360 — édité par Pukri AI Systems
        </p>
      </div>

      {/* Colonne d'action */}
      <div className="flex items-center justify-center px-5 py-10 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-sm"
        >
          {/* Marque compacte (mobile uniquement) */}
          <div className="mb-8 lg:hidden">
            <span className="font-display text-xl font-bold tracking-tight text-fg">
              BudgetPilot<span className="text-accent-ink">360</span>
            </span>
          </div>

          <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </motion.div>
      </div>
    </div>
  );
}
