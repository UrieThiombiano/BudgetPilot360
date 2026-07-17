/** Flux de connexion (Phase 12.1) : saisie, appel Supabase Auth, gestion d'erreur. */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "../pages/LoginPage";
import { supabase } from "../lib/supabaseClient";

vi.mock("../lib/supabaseClient", () => ({
  supabase: { auth: { signInWithPassword: vi.fn(), signInWithOtp: vi.fn() } },
}));

const signIn = vi.mocked(supabase.auth.signInWithPassword);
const signInOtp = vi.mocked(supabase.auth.signInWithOtp);

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  beforeEach(() => signIn.mockReset());

  it("affiche les champs email et mot de passe avec leurs labels", () => {
    renderLogin();

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Mot de passe")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeInTheDocument();
  });

  it("envoie les identifiants saisis à Supabase Auth", async () => {
    signIn.mockResolvedValue({ error: null } as never);
    renderLogin();

    await userEvent.type(screen.getByLabelText("Email"), "admin@acme-corp.fr");
    await userEvent.type(screen.getByLabelText("Mot de passe"), "MotDePasse-2026!");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(signIn).toHaveBeenCalledWith({
      email: "admin@acme-corp.fr",
      password: "MotDePasse-2026!",
    });
  });

  it("envoie un lien magique sans jamais créer de compte", async () => {
    signInOtp.mockResolvedValue({ error: null } as never);
    renderLogin();

    await userEvent.click(screen.getByRole("tab", { name: "Lien par email" }));
    await userEvent.type(screen.getByLabelText("Email"), "admin@acme-corp.fr");
    await userEvent.click(
      screen.getByRole("button", { name: "Recevoir le lien de connexion" })
    );

    expect(signInOtp).toHaveBeenCalledWith({
      email: "admin@acme-corp.fr",
      options: expect.objectContaining({ shouldCreateUser: false }),
    });
    expect(await screen.findByText(/Lien de connexion envoyé/)).toBeInTheDocument();
  });

  it("affiche un message français sur identifiants invalides", async () => {
    signIn.mockResolvedValue({ error: { message: "Invalid login credentials" } } as never);
    renderLogin();

    await userEvent.type(screen.getByLabelText("Email"), "x@acme-corp.fr");
    await userEvent.type(screen.getByLabelText("Mot de passe"), "mauvais");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(
      await screen.findByText("Email ou mot de passe incorrect.")
    ).toBeInTheDocument();
  });
});
