import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../hooks/useTheme";
import NotificationsBell from "./NotificationsBell";
import AiAssistant from "./AiAssistant";

const SIDEBAR_KEY = "bp360-sidebar-collapsed";

const navLinkClass = (isActive: boolean, collapsed: boolean) =>
  [
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    collapsed ? "justify-center px-0" : "",
    isActive
      ? "bg-indigo-600 text-white"
      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
  ].join(" ");

interface NavItem {
  to: string;
  icon: string;
  label: string;
  end?: boolean;
}

function SidebarContent({
  collapsed = false,
  onNavigate,
  onToggleCollapse,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  /** Fourni uniquement par la sidebar desktop — le drawer mobile ne se réduit pas. */
  onToggleCollapse?: () => void;
}) {
  const { profile, signOut } = useAuth();
  const isSuperAdmin = profile?.role === "super_admin";
  // Les écrans métier supposent une entreprise : un super_admin (Pukri) n'en a pas.
  const hasCompany = Boolean(profile?.company_id);
  const isAdmin = profile?.role === "admin" || isSuperAdmin;

  const items: NavItem[] = [
    ...(isSuperAdmin ? [{ to: "/platform", icon: "🛡️", label: "Plateforme" }] : []),
    ...(hasCompany
      ? [
          { to: "/", icon: "📊", label: "Dashboard", end: true },
          { to: "/expenses", icon: "🧾", label: "Mes dépenses" },
          { to: "/budget", icon: "💰", label: "Budget" },
          ...(isAdmin
            ? [
                { to: "/approvals", icon: "✅", label: "Approbations" },
                { to: "/reports", icon: "📄", label: "Rapports" },
                { to: "/team", icon: "👥", label: "Équipe" },
              ]
            : []),
        ]
      : []),
  ];

  return (
    <div className="flex h-full flex-col">
      <div className={`flex h-16 items-center ${collapsed ? "justify-center" : "px-5"}`}>
        <span className="text-lg font-bold text-slate-900 dark:text-white">
          {collapsed ? (
            <>
              B<span className="text-indigo-600">360</span>
            </>
          ) : (
            <>
              BudgetPilot<span className="text-indigo-600">360</span>
            </>
          )}
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            aria-label={item.label}
            className={({ isActive }) => navLinkClass(isActive, collapsed)}
          >
            <span aria-hidden="true">{item.icon}</span>
            {!collapsed && item.label}
          </NavLink>
        ))}
      </nav>

      {/* Pied de sidebar : réduire (desktop) puis déconnexion, pleine largeur */}
      <div className="space-y-1 border-t border-slate-100 px-3 py-3 dark:border-slate-800">
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Étendre la navigation" : "Réduire la navigation"}
            aria-pressed={collapsed}
            title={collapsed ? "Étendre la navigation" : "Réduire la navigation"}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            <span aria-hidden="true">{collapsed ? "⏵" : "⏴"}</span>
            {!collapsed && "Réduire"}
          </button>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="Déconnexion"
          title={collapsed ? "Déconnexion" : undefined}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <span aria-hidden="true">⏻</span>
          {!collapsed && "Déconnexion"}
        </button>
      </div>
      {!collapsed && (
        <p className="px-5 pb-3 text-xs text-slate-400 dark:text-slate-500">
          © Pukri AI Systems
        </p>
      )}
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Sidebar réductible (desktop) : le contenu passe en pleine largeur, choix mémorisé.
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) === "1"
  );
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      localStorage.setItem(SIDEBAR_KEY, c ? "0" : "1");
      return !c;
    });

  useEffect(() => {
    if (!sidebarOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Sidebar desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden border-r border-slate-200 bg-white transition-[width] duration-200 lg:block dark:border-slate-800 dark:bg-slate-950 ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <SidebarContent collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </aside>

      {/* Sidebar mobile (drawer) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50"
            aria-hidden="true"
            onClick={() => setSidebarOpen(false)}
          />
          <aside
            role="dialog"
            aria-label="Menu de navigation"
            className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl dark:bg-slate-950"
          >
            <SidebarContent onNavigate={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      <div
        className={`transition-[padding] duration-200 ${collapsed ? "lg:pl-16" : "lg:pl-64"}`}
      >
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-950/80">
          {/* Ouvre le drawer (mobile) */}
          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => setSidebarOpen(true)}
            aria-label="Ouvrir le menu"
          >
            ☰
          </button>

          <div className="flex flex-1 items-center justify-end gap-3">
            <NotificationsBell />
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Basculer le thème"
              title={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>

            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {profile?.email}
              </p>
              <p className="text-xs capitalize text-slate-500 dark:text-slate-400">
                {profile?.role}
              </p>
            </div>
          </div>
        </header>

        {/* Transition de page : chaque changement de route ré-anime le contenu */}
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="p-4 sm:p-6 lg:p-8"
        >
          {children}
        </motion.main>
      </div>

      {/* Assistant IA : capacité admin (tableau RBAC), le backend re-vérifie.
          Nécessite une entreprise : le contexte IA est scopé company_id. */}
      {isAdmin && profile?.company_id && <AiAssistant />}
    </div>
  );
}
