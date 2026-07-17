/** Flux de création de dépense (Phase 12.1) : formulaire → POST /expenses → confirmation. */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MyExpensesPage from "../pages/MyExpensesPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  apiErrorMessage: () => "Une erreur inattendue est survenue. Réessayez.",
}));

const apiGet = vi.mocked(api.get);
const apiPost = vi.mocked(api.post);

const CATEGORIES = [{ id: "c1", name: "Transport" }];
const EXPENSES = [
  {
    id: "e1",
    amount: 25000,
    expense_date: "2026-07-10",
    description: "Taxi Ouaga",
    status: "approved",
    category_name: "Transport",
    has_receipt: false,
    rejection_reason: null,
  },
];

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MyExpensesPage />
    </QueryClientProvider>
  );
}

describe("MyExpensesPage", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/categories") return { data: CATEGORIES } as never;
      if (url === "/expenses/mine") return { data: EXPENSES } as never;
      throw new Error(`GET inattendu : ${url}`);
    });
  });

  it("affiche l'historique avec montant FCFA et statut", async () => {
    renderPage();

    expect(await screen.findByText(/25\s?000\s?F\s?CFA/)).toBeInTheDocument();
    expect(screen.getByText("Approuvée")).toBeInTheDocument();
    expect(screen.getByText("Taxi Ouaga")).toBeInTheDocument();
  });

  it("soumet une dépense et affiche la confirmation", async () => {
    apiPost.mockResolvedValue({
      data: { id: "e2", amount: 5000, status: "pending" },
    } as never);
    renderPage();

    await userEvent.type(await screen.findByLabelText("Montant (FCFA)"), "5000");
    await userEvent.selectOptions(screen.getByLabelText("Catégorie"), "c1");
    await userEvent.type(screen.getByLabelText("Description"), "Carburant moto");
    await userEvent.click(
      screen.getByRole("button", { name: "Soumettre la dépense" })
    );

    expect(apiPost).toHaveBeenCalledWith(
      "/expenses",
      expect.objectContaining({
        amount: 5000,
        category_id: "c1",
        description: "Carburant moto",
      })
    );
    expect(
      await screen.findByText(/en attente d'approbation par votre admin/)
    ).toBeInTheDocument();
  });

  it("bloque la soumission sans catégorie choisie", async () => {
    renderPage();

    await userEvent.type(await screen.findByLabelText("Montant (FCFA)"), "5000");
    await userEvent.click(
      screen.getByRole("button", { name: "Soumettre la dépense" })
    );

    // La validation native `required` du select bloque la soumission
    expect(screen.getByLabelText("Catégorie")).toBeInvalid();
    expect(apiPost).not.toHaveBeenCalled();
  });
});
