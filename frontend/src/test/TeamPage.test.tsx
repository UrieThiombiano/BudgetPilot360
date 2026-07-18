/** Gestion d'équipe : retrait (désactivation douce) d'un utilisateur,
 * nomination/révocation d'un admin adjoint (réservé au principal),
 * fonction affichée comme libellé de rôle. */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TeamPage from "../pages/TeamPage";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), patch: vi.fn() },
  apiErrorMessage: () => "Une erreur inattendue est survenue. Réessayez.",
}));

// Identité mutable : « a1 » est l'admin principal (owner) par défaut.
const authState = vi.hoisted(() => ({ id: "a1", role: "admin" }));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    profile: { id: authState.id, email: "awa@acme-corp.fr", company_id: "co1", role: authState.role },
  }),
}));

const apiGet = vi.mocked(api.get);
const apiDelete = vi.mocked(api.delete);
const apiPatch = vi.mocked(api.patch);

const ADMIN_M = {
  id: "a1",
  email: "awa@acme-corp.fr",
  full_name: "Awa Admin",
  job_title: null,
  role: "admin",
  created_at: "2026-07-01T10:00:00Z",
};
const USER_M = {
  id: "u1",
  email: "jean@acme-corp.fr",
  full_name: "Jean User",
  job_title: "Comptable",
  role: "user",
  created_at: "2026-07-02T10:00:00Z",
};
const ADJOINT_M = {
  id: "a2",
  email: "issa@acme-corp.fr",
  full_name: "Issa Adjoint",
  job_title: "Cofondateur",
  role: "admin",
  created_at: "2026-07-03T10:00:00Z",
};

const TEAM = {
  members: [ADMIN_M, USER_M],
  owner_id: "a1",
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
    authState.id = "a1";
    authState.role = "admin";
    apiGet.mockReset();
    apiDelete.mockReset();
    apiPatch.mockReset();
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

describe("TeamPage — admin adjoint & libellés de rôle", () => {
  beforeEach(() => {
    authState.id = "a1";
    authState.role = "admin";
    apiGet.mockReset();
    apiDelete.mockReset();
    apiPatch.mockReset();
  });

  it("affiche « Admin principal » et la fonction comme rôle d'un user", async () => {
    apiGet.mockResolvedValue({ data: TEAM } as never);
    renderPage();

    expect(await screen.findByText("Admin principal")).toBeInTheDocument();
    // Le rôle affiché d'un utilisateur est sa fonction, pas « Utilisateur ».
    expect(screen.getByText("Comptable")).toBeInTheDocument();
    expect(screen.queryByText("Utilisateur")).not.toBeInTheDocument();
  });

  it("le principal nomme un user adjoint via PATCH /role", async () => {
    apiGet.mockResolvedValue({ data: TEAM } as never);
    apiPatch.mockResolvedValue({ data: { ...USER_M, role: "admin" } } as never);
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: /Nommer Jean User admin adjoint/ })
    );

    expect(apiPatch).toHaveBeenCalledWith("/team/members/u1/role", { role: "admin" });
    expect(await screen.findByText(/Admin adjoint nommé/)).toBeInTheDocument();
  });

  it("avec un adjoint en place : sa fonction affichée, révocation possible, plus de nomination", async () => {
    apiGet.mockResolvedValue({
      data: { ...TEAM, members: [ADMIN_M, ADJOINT_M, USER_M] },
    } as never);
    apiPatch.mockResolvedValue({ data: { ...ADJOINT_M, role: "user" } } as never);
    renderPage();

    // L'adjoint est désigné par SA fonction ; l'infobulle précise le rôle technique.
    expect(await screen.findByText("Cofondateur")).toBeInTheDocument();
    expect(screen.getByTitle("Admin adjoint")).toBeInTheDocument();
    // Un seul adjoint : plus aucun bouton de nomination.
    expect(screen.queryByRole("button", { name: /admin adjoint$/ })).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /Retirer le rôle d'adjoint de Issa Adjoint/ })
    );
    expect(apiPatch).toHaveBeenCalledWith("/team/members/a2/role", { role: "user" });
  });

  it("un admin non propriétaire (adjoint) ne voit aucun bouton de gestion des rôles", async () => {
    authState.id = "a2"; // connecté en tant qu'adjoint
    apiGet.mockResolvedValue({
      data: { ...TEAM, members: [ADMIN_M, ADJOINT_M, USER_M] },
    } as never);
    renderPage();

    // Il voit l'équipe mais ne gère pas les rôles…
    await screen.findByText("Admin principal");
    expect(screen.queryByRole("button", { name: /adjoint/i })).not.toBeInTheDocument();
    // …mais peut toujours retirer un user.
    expect(screen.getByRole("button", { name: /Retirer Jean User/ })).toBeInTheDocument();
  });
});
