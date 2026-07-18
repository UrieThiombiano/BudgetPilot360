import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SendHorizontal, Sparkles, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api";

interface Message {
  role: "user" | "assistant" | "error";
  content: string;
}

const SUGGESTIONS = [
  "Où en est le budget cette année ?",
  "Quelles catégories dépassent leur budget ?",
  "Quel est mon bénéfice net ce mois-ci ?",
];

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^(\s*)[*•]\s+/gm, "$1- ")
    .replace(/`([^`]*)`/g, "$1");
}

/**
 * Assistant IA (Mistral) — bulle flottante, admin uniquement. Chaque question
 * part sur POST /ai/ask ; le backend construit le contexte scopé entreprise,
 * la clé API ne quitte jamais le serveur.
 */
export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const ask = useMutation({
    mutationFn: async (question: string) =>
      (await api.post<{ answer: string }>("/ai/ask", { question })).data,
    onSuccess: (data) =>
      setMessages((prev) => [...prev, { role: "assistant", content: stripMarkdown(data.answer) }]),
    onError: (err) =>
      setMessages((prev) => [...prev, { role: "error", content: apiErrorMessage(err) }]),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, ask.isPending]);

  useEffect(() => {
    if (!open) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [open]);

  function send(question: string) {
    const trimmed = question.trim();
    if (trimmed.length < 3 || ask.isPending) return;
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    ask.mutate(trimmed);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        aria-label={open ? "Fermer l'assistant IA" : "Ouvrir l'assistant IA"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-accent-glow"
      >
        {open ? <X size={20} strokeWidth={2} /> : <Sparkles size={20} strokeWidth={2} />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-label="Assistant budgétaire IA"
            className="fixed bottom-20 right-5 z-40 flex h-[min(540px,calc(100vh-7rem))] w-[min(390px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-popover"
          >
            <div className="flex items-center gap-2.5 bg-accent px-4 py-3.5 text-accent-fg">
              <Sparkles size={18} strokeWidth={2} />
              <div>
                <p className="font-display text-sm font-semibold">Assistant budgétaire</p>
                <p className="text-xs text-accent-fg/70">Répond sur vos données réelles.</p>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && (
                <div>
                  <p className="text-sm text-fg-muted">
                    Posez une question sur votre budget, vos recettes ou vos dépenses.
                  </p>
                  <div className="mt-3 flex flex-col items-start gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className="rounded-lg border border-line px-3 py-1.5 text-left text-xs text-accent-ink transition-colors hover:bg-accent-soft"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-sm text-accent-fg"
                        : m.role === "error"
                          ? "max-w-[85%] rounded-2xl rounded-bl-sm bg-danger-soft px-3 py-2 text-sm text-danger-ink"
                          : "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-surface-2 px-3 py-2 text-sm text-fg"
                    }
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {ask.isPending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-surface-2 px-3 py-2.5 text-sm text-fg-muted">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-subtle [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-subtle [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-subtle" />
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-line p-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={500}
                placeholder="Votre question…"
                aria-label="Question à l'assistant IA"
                className="field flex-1"
              />
              <button
                type="submit"
                disabled={input.trim().length < 3 || ask.isPending}
                aria-label="Envoyer"
                className="btn btn-primary px-3"
              >
                <SendHorizontal size={17} strokeWidth={2} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
