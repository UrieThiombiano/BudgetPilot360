/** Flux d'approbation (Phase 12.1) : liste pending, approbation, rejet motivé. */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ApprovalsPage from "../pages/ApprovalsPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  apiErrorMessage: () => "Une erreur inattendue est survenue. Réessayez.",
}));

const apiGet = vi.mocked(api.get);
const apiPost = vi.mocked(api.post);

const PENDING = [
  {
    id: "e1",
    amount: 45000,
    expense_date: "2026-07-15",
    description: "Plein essence",
    category_name: "Carburant",
    author_name: "Jean Kaboré",
    has_receipt: false,
  },
];

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApprovalsPage />
    </QueryClientProvider>
  );
}

describe("ApprovalsPage", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiGet.mockResolvedValue({ data: PENDING } as never);
  });

  it("liste les dépenses en attente avec auteur et montant", async () => {
    renderPage();

    expect(await screen.findByText(/45\s?000\s?F\s?CFA/)).toBeInTheDocument();
    expect(screen.getByText("Jean Kaboré")).toBeInTheDocument();
  });

  it("approuve une dépense via POST /review", async () => {
    apiPost.mockResolvedValue({ data: { id: "e1", status: "approved" } } as never);
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "✓ Approuver" }));

    expect(apiPost).toHaveBeenCalledWith("/expenses/e1/review", {
      action: "approve",
      reason: null,
    });
    expect(
      await screen.findByText("Dépense approuvée — budget mis à jour.")
    ).toBeInTheDocument();
  });

  it("exige un motif pour rejeter, puis l'envoie", async () => {
    apiPost.mockResolvedValue({ data: { id: "e1", status: "rejected" } } as never);
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "✕ Rejeter" }));
    const confirm = screen.getByRole("button", { name: "Confirmer le rejet" });
    expect(confirm).toBeDisabled(); // pas de rejet sans motif

    await userEvent.type(
      screen.getByLabelText("Motif du rejet"),
      "Justificatif manquant"
    );
    await userEvent.click(confirm);

    expect(apiPost).toHaveBeenCalledWith("/expenses/e1/review", {
      action: "reject",
      reason: "Justificatif manquant",
    });
  });

  it("affiche l'état vide quand tout est traité", async () => {
    apiGet.mockResolvedValue({ data: [] } as never);
    renderPage();

    expect(
      await screen.findByText(/Aucune dépense en attente/)
    ).toBeInTheDocument();
  });
});
