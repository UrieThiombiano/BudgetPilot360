/** Flux de création de recette : formulaire (avec source) → POST /revenues →
 * confirmation. Vérifie aussi le vocabulaire « Confirmée ». */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MyRevenuesPage from "../pages/MyRevenuesPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  apiErrorMessage: () => "Une erreur inattendue est survenue. Réessayez.",
}));

const apiGet = vi.mocked(api.get);
const apiPost = vi.mocked(api.post);

const CATEGORIES = [{ id: "cr1", name: "Ventes" }];
const REVENUES = [
  {
    id: "r1",
    amount: 150000,
    revenue_date: "2026-07-10",
    description: "Vente boutique",
    source: "Client A",
    status: "approved",
    category_name: "Ventes",
    has_proof: false,
    rejection_reason: null,
  },
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MyRevenuesPage />
    </QueryClientProvider>
  );
}

describe("MyRevenuesPage", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/categories") return { data: CATEGORIES } as never;
      if (url === "/revenues/mine") return { data: REVENUES } as never;
      throw new Error(`GET inattendu : ${url}`);
    });
  });

  it("affiche l'historique avec le statut « Confirmée » et la source", async () => {
    renderPage();

    expect(await screen.findByText(/150\s?000\s?F\s?CFA/)).toBeInTheDocument();
    expect(screen.getByText("Confirmée")).toBeInTheDocument(); // pas « Approuvée »
    expect(screen.getByText(/Client A/)).toBeInTheDocument();
  });

  it("enregistre une recette avec source et affiche la confirmation", async () => {
    apiPost.mockResolvedValue({ data: { id: "r2", amount: 90000, status: "pending" } } as never);
    renderPage();

    await userEvent.type(await screen.findByLabelText("Montant (FCFA)"), "90000");
    await userEvent.selectOptions(screen.getByLabelText("Catégorie"), "cr1");
    await userEvent.type(
      screen.getByLabelText("Source / client (facultatif)"),
      "Client B"
    );
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer la recette" }));

    expect(apiPost).toHaveBeenCalledWith(
      "/revenues",
      expect.objectContaining({ amount: 90000, category_id: "cr1", source: "Client B" })
    );
    expect(
      await screen.findByText(/comptée dans les recettes de l'entreprise/)
    ).toBeInTheDocument();
  });
});
