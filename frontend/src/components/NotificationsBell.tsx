import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string | null;
}

/** Icône par type de notification (workflow dépenses + alertes de seuil budgétaire). */
function iconFor(type: string): string {
  if (type === "expense_approved") return "✅ ";
  if (type === "expense_rejected") return "❌ ";
  if (type === "budget_threshold_100") return "🚨 ";
  if (type.startsWith("budget_threshold_")) return "⚠️ ";
  return "";
}

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get<Notification[]>("/notifications")).data,
    refetchInterval: 30_000, // Realtime Supabase prendra le relais plus tard
  });

  const unread = (notifications ?? []).filter((n) => !n.read).length;

  const markAllRead = useMutation({
    mutationFn: async () => api.post("/notifications/mark-read"),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        aria-label={unread > 0 ? `Notifications (${unread} non lue${unread > 1 ? "s" : ""})` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              Notifications
            </p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Tout marquer lu
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {(notifications ?? []).length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                Aucune notification.
              </li>
            )}
            {(notifications ?? []).map((n) => (
              <li
                key={n.id}
                className={`border-b border-slate-50 px-4 py-3 last:border-0 dark:border-slate-800/50 ${
                  n.read ? "" : "bg-indigo-50/60 dark:bg-indigo-950/30"
                }`}
              >
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  {iconFor(n.type)}
                  {n.title}
                </p>
                {n.body && (
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {n.body}
                  </p>
                )}
                {n.created_at && (
                  <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                    {new Date(n.created_at).toLocaleString("fr-FR")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
