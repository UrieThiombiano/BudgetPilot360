import { useEffect, useRef, useState, type ComponentType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CircleCheck,
  CircleX,
  OctagonAlert,
  TriangleAlert,
  type LucideProps,
} from "lucide-react";
import { api } from "../lib/api";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string | null;
}

/** Pastille d'icône colorée par type de notification. */
function NotifIcon({ type }: { type: string }) {
  let Icon: ComponentType<LucideProps> = CircleCheck;
  let cls = "bg-success-soft text-success-ink";
  if (type.endsWith("_rejected")) {
    Icon = CircleX;
    cls = "bg-danger-soft text-danger-ink";
  } else if (type === "budget_threshold_100") {
    Icon = OctagonAlert;
    cls = "bg-danger-soft text-danger-ink";
  } else if (type.startsWith("budget_threshold_")) {
    Icon = TriangleAlert;
    cls = "bg-warning-soft text-warning-ink";
  }
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cls}`}>
      <Icon size={16} strokeWidth={2} />
    </span>
  );
}

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get<Notification[]>("/notifications")).data,
    refetchInterval: 30_000,
  });

  const unread = (notifications ?? []).filter((n) => !n.read).length;

  const markAllRead = useMutation({
    mutationFn: async () => api.post("/notifications/mark-read"),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
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
        className="relative rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        aria-label={unread > 0 ? `Notifications, ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell size={19} strokeWidth={1.85} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-danger-fg ring-2 ring-bg">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            role="dialog"
            aria-label="Notifications"
            className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line bg-surface shadow-popover"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="font-display text-sm font-semibold text-fg">Notifications</p>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="text-xs font-medium text-accent-ink hover:underline"
                >
                  Tout marquer comme lu
                </button>
              )}
            </div>
            <ul className="max-h-80 overflow-y-auto">
              {(notifications ?? []).length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-fg-subtle">
                  Vous êtes à jour — aucune notification.
                </li>
              )}
              {(notifications ?? []).map((n) => (
                <li
                  key={n.id}
                  className={`flex gap-3 border-b border-line/60 px-4 py-3 last:border-0 ${
                    n.read ? "" : "bg-accent-soft"
                  }`}
                >
                  <NotifIcon type={n.type} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-xs text-fg-muted">{n.body}</p>}
                    {n.created_at && (
                      <p className="mt-1 text-[11px] text-fg-subtle">
                        {new Date(n.created_at).toLocaleString("fr-FR")}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
