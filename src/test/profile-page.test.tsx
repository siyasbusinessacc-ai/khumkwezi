import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProfilePage from "@/pages/ProfilePage";

const mockNavigate = vi.fn();
const mockToast = vi.fn();
const mockSignOut = vi.fn().mockResolvedValue(undefined);

const fakeProfile = {
  id: "p1",
  user_id: "u1",
  name: "Thabo",
  surname: "Mokoena",
  student_number: "202301234",
  primary_phone: "+27 81 234 5678",
  secondary_phone: null,
  email: "thabo@uni.ac.za",
  avatar_url: null,
  emergency_contact_name: "Ma Mokoena",
  emergency_contact_phone: "+27 83 456 7890",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

let fetchResult: { data: any; error: any } = { data: fakeProfile, error: null };
let updateResult: { error: any } = { error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(fetchResult),
        }),
      }),
      update: () => ({
        eq: () => Promise.resolve(updateResult),
      }),
    })),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, signOut: mockSignOut }),
}));

vi.mock("react-router-dom", async () => {
  const actual: any = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>
  );

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchResult = { data: fakeProfile, error: null };
    updateResult = { error: null };
  });

  it("shows loading state then populates fields from profile", async () => {
    renderPage();
    expect(screen.getByText(/Loading profile/i)).toBeInTheDocument();
    await waitFor(() =>
      expect((screen.getByPlaceholderText("First name") as HTMLInputElement).value).toBe("Thabo")
    );
    expect((screen.getByPlaceholderText("Last name") as HTMLInputElement).value).toBe("Mokoena");
    expect((screen.getByPlaceholderText("e.g. 202301234") as HTMLInputElement).value).toBe("202301234");
  });

  it("shows success toast after saving", async () => {
    renderPage();
    await waitFor(() => screen.getByPlaceholderText("First name"));
    fireEvent.click(screen.getByRole("button", { name: /Save Profile/i }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Saved" }))
    );
  });

  it("shows error toast when save fails", async () => {
    updateResult = { error: { message: "RLS denied" } };
    renderPage();
    await waitFor(() => screen.getByPlaceholderText("First name"));
    fireEvent.click(screen.getByRole("button", { name: /Save Profile/i }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Error", variant: "destructive" })
      )
    );
  });

  it("Sign Out button calls signOut and navigates to /auth", async () => {
    renderPage();
    await waitFor(() => screen.getByPlaceholderText("First name"));
    fireEvent.click(screen.getByRole("button", { name: /Sign Out/i }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/auth"));
  });

  it("handles missing profile gracefully", async () => {
    fetchResult = { data: null, error: null };
    renderPage();
    await waitFor(() => screen.getByPlaceholderText("First name"));
    expect((screen.getByPlaceholderText("First name") as HTMLInputElement).value).toBe("");
  });
});
