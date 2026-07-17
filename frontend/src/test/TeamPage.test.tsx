/** Gestion d'équipe : retrait (désactivation douce) d'un utilisateur.
 * Un admin ne peut retirer qu'un `user` ; la confirmation appelle DELETE. */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TeamPage from "../pages/TeamPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  apiErrorMessage: () => "Une erreur inattendue est survenue. Réessayez.",
}));

const apiGet = vi.mocked(api.get);
const apiDelete = vi.mocked(api.delete);

const TEAM = {
  members: [
    {
      id: "a1",
      email: "awa@acme-corp.fr",
      full_name: "Awa Admin",
      job_title: null,
      role: "admin",
      created_at: "2026-07-01T10:00:00Z",
    },
    {
      id: "u1",
      email: "jean@acme-corp.fr",
      full_name: "Jean User",
      job_title: "Comptable",
      role: "user",
      created_at: "2026-07-02T10:00:00Z",
    },
  ],
  user_count: 1,
  max_users: 3,
  can_add_user: true,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TeamPage />
    </QueryClientProvider>
  );
}

describe("TeamPage — retrait d'un utilisateur", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiDelete.mockReset();
    apiGet.mockResolvedValue({ data: TEAM } as never);
  });

  it("propose « Retirer » pour un user mais jamais pour un admin", async () => {
    renderPage();

    expect(
      await screen.findByRole("button", { name: /Retirer Jean User/ })
    ).toBeInTheDocument();
    // L'administrateur n'est pas retirable.
    expect(
      screen.queryByRole("button", { name: /Retirer Awa Admin/ })
    ).not.toBeInTheDocument();
  });

  it("confirme puis appelle DELETE /team/members/{id}", async () => {
    apiDelete.mockResolvedValue({ data: null } as never);
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: /Retirer Jean User/ })
    );
    // Étape de confirmation avant l'action destructrice.
    await userEvent.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(apiDelete).toHaveBeenCalledWith("/team/members/u1");
    expect(await screen.findByText(/Utilisateur retiré/)).toBeInTheDocument();
  });
});
