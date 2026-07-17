import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api";

interface Message {
  role: "user" | "assistant" | "error";
  content: string;
}

const SUGGESTIONS = [
  "Où en est le budget cette année ?",
  "Quelles catégories sont en dépassement ?",
  "Qu'est-ce qui a été dépensé ce mois-ci ?",
];

/**
 * Le prompt système exige du texte brut, mais un modèle peut laisser passer du
 * Markdown : on retire défensivement gras/italique/titres/backticks (la bulle
 * affiche du texte, les astérisques bruts seraient illisibles).
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^(\s*)[*•]\s+/gm, "$1- ")
    .replace(/`([^`]*)`/g, "$1");
}

/**
 * Assistant IA (Mistral) — bulle flottante, admin uniquement.
 * Chaque question part sur POST /ai/ask ; le backend construit le contexte
 * factuel scopé sur l'entreprise, la clé API ne quitte jamais le serveur.
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
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: stripMarkdown(data.answer) },
      ]),
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
      {/* Bulle flottante */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Fermer l'assistant IA" : "Ouvrir l'assistant IA"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-xl text-white shadow-lg shadow-indigo-600/30 transition-transform hover:scale-105 hover:bg-indigo-700"
      >
        {open ? "✕" : "✨"}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            role="dialog"
            aria-label="Assistant budgétaire IA"
            className="fixed bottom-20 right-5 z-40 flex h-[min(520px,calc(100vh-7rem))] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950"
          >
            {/* En-tête */}
            <div className="border-b border-slate-100 bg-indigo-600 px-4 py-3 dark:border-slate-800">
              <p className="text-sm font-semibold text-white">✨ Assistant budgétaire</p>
              <p className="text-xs text-indigo-200">
                Répond à partir des données réelles de votre entreprise.
              </p>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && (
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Posez une question sur votre budget, vos catégories ou vos dépenses.
                  </p>
                  <div className="mt-3 flex flex-col items-start gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className="rounded-lg border border-indigo-200 px-3 py-1.5 text-left text-xs text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
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
                        ? "max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-3 py-2 text-sm text-white"
                        : m.role === "error"
                          ? "max-w-[85%] rounded-2xl rounded-bl-sm bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300"
                          : "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                    }
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {ask.isPending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <span className="animate-pulse">Analyse des données…</span>
                  </div>
                </div>
              )}
            </div>

            {/* Saisie */}
            <form
              onSubmit={onSubmit}
              className="flex items-center gap-2 border-t border-slate-100 p-3 dark:border-slate-800"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={500}
                placeholder="Votre question…"
                aria-label="Question à l'assistant IA"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <button
                type="submit"
                disabled={input.trim().length < 3 || ask.isPending}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                ➤
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
