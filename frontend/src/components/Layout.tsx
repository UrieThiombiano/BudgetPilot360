import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CircleCheck,
  FileText,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  ShieldCheck,
  Sun,
  Users,
  Wallet,
  type LucideProps,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../hooks/useTheme";
import NotificationsBell from "./NotificationsBell";
import AiAssistant from "./AiAssistant";

const SIDEBAR_KEY = "bp360-sidebar-collapsed";

interface NavItem {
  to: string;
  icon: ComponentType<LucideProps>;
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
  onToggleCollapse?: () => void;
}) {
  const { profile, signOut } = useAuth();
  const isSuperAdmin = profile?.role === "super_admin";
  const hasCompany = Boolean(profile?.company_id);
  const isAdmin = profile?.role === "admin" || isSuperAdmin;

  const items: NavItem[] = [
    ...(isSuperAdmin ? [{ to: "/platform", icon: ShieldCheck, label: "Plateforme" }] : []),
    ...(hasCompany
      ? [
          { to: "/", icon: LayoutDashboard, label: "Tableau de bord", end: true },
          { to: "/expenses", icon: Receipt, label: isAdmin ? "Dépenses" : "Mes dépenses" },
          { to: "/revenues", icon: HandCoins, label: isAdmin ? "Recettes" : "Mes recettes" },
          { to: "/budget", icon: Wallet, label: "Budget & catégories" },
          ...(isAdmin
            ? [
                { to: "/approvals", icon: CircleCheck, label: "Approbations" },
                { to: "/reports", icon: FileText, label: "Rapports" },
                { to: "/team", icon: Users, label: "Équipe" },
              ]
            : []),
        ]
      : []),
  ];

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className={`flex h-16 items-center ${collapsed ? "justify-center" : "px-5"}`}>
        <span className="font-display text-lg font-bold tracking-tight text-fg">
          {collapsed ? (
            <>B<span className="text-accent-ink">360</span></>
          ) : (
            <>BudgetPilot<span className="text-accent-ink">360</span></>
          )}
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            aria-label={label}
            className={({ isActive }) =>
              [
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                collapsed ? "justify-center px-0" : "",
                isActive
                  ? "bg-accent text-accent-fg shadow-card"
                  : "text-fg-muted hover:bg-surface-2 hover:text-fg",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                {isActive && !collapsed && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r-full bg-accent-fg/70"
                    style={{ width: 3 }}
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <Icon size={19} strokeWidth={1.85} className="shrink-0" />
                {!collapsed && label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-1 border-t border-line px-3 py-3">
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Étendre la navigation" : "Réduire la navigation"}
            aria-pressed={collapsed}
            title={collapsed ? "Étendre la navigation" : "Réduire la navigation"}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            {collapsed ? <PanelLeftOpen size={19} strokeWidth={1.85} /> : <PanelLeftClose size={19} strokeWidth={1.85} />}
            {!collapsed && "Réduire"}
          </button>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="Se déconnecter"
          title={collapsed ? "Se déconnecter" : undefined}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-danger-ink transition-colors hover:bg-danger-soft ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <LogOut size={19} strokeWidth={1.85} />
          {!collapsed && "Se déconnecter"}
        </button>
      </div>
      {!collapsed && (
        <p className="px-5 pb-3 text-xs text-fg-subtle">© Pukri AI Systems</p>
      )}
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    <div className="min-h-screen bg-bg">
      {/* Sidebar desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden border-r border-line transition-[width] duration-200 lg:block ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <SidebarContent collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </aside>

      {/* Sidebar mobile (drawer) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 backdrop-blur-sm"
            style={{ backgroundColor: "rgb(var(--overlay) / 0.55)" }}
            aria-hidden="true"
            onClick={() => setSidebarOpen(false)}
          />
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            role="dialog"
            aria-label="Menu de navigation"
            className="absolute inset-y-0 left-0 w-64 shadow-popover"
          >
            <SidebarContent onNavigate={() => setSidebarOpen(false)} />
          </motion.aside>
        </div>
      )}

      <div className={`transition-[padding] duration-200 ${collapsed ? "lg:pl-16" : "lg:pl-64"}`}>
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-bg/80 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu size={20} strokeWidth={1.85} />
          </button>

          <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
            <NotificationsBell />
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
              aria-label="Basculer le thème clair / sombre"
              title={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
            >
              {theme === "dark" ? <Sun size={19} strokeWidth={1.85} /> : <Moon size={19} strokeWidth={1.85} />}
            </button>

            <div className="hidden pl-1 text-right sm:block">
              <p className="text-sm font-medium text-fg">{profile?.email}</p>
              <p className="text-xs capitalize text-fg-subtle">
                {/* Chacun est désigné par son rôle dans l'entreprise (job_title). */}
                {profile?.role === "super_admin"
                  ? "Super administrateur"
                  : profile?.job_title ||
                    (profile?.role === "admin" ? "Administrateur" : "Utilisateur")}
              </p>
            </div>
          </div>
        </header>

        {/* Transition de page : chaque changement de route ré-anime le contenu */}
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="p-4 sm:p-6 lg:p-8"
        >
          {children}
        </motion.main>
      </div>

      {isAdmin && profile?.company_id && <AiAssistant />}
    </div>
  );
}
