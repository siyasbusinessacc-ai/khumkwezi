import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudentDashboard from "@/components/StudentDashboard";

let fetchResult: { data: any; error: any } = { data: null, error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(fetchResult),
        }),
      }),
    })),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

// Mock asset imports
vi.mock("@/assets/menu-ribeye.jpg", () => ({ default: "ribeye.jpg" }));
vi.mock("@/assets/menu-arancini.jpg", () => ({ default: "arancini.jpg" }));
vi.mock("@/assets/shisha-pairing.jpg", () => ({ default: "shisha.jpg" }));

const renderDash = () =>
  render(
    <MemoryRouter>
      <StudentDashboard />
    </MemoryRouter>
  );

describe("StudentDashboard", () => {
  beforeEach(() => {
    fetchResult = { data: null, error: null };
  });

  it("renders a time-based greeting", () => {
    renderDash();
    const greetings = ["Good Morning", "Good Afternoon", "Good Evening"];
    expect(greetings.some((g) => screen.queryByText(g))).toBe(true);
  });

  it("renders the brand heading", () => {
    renderDash();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Khumkwhezi/);
  });

  it("falls back to '?' initials when no profile", () => {
    renderDash();
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("displays correct initials when profile loads", async () => {
    fetchResult = {
      data: {
        id: "p1",
        user_id: "u1",
        name: "Thabo",
        surname: "Mokoena",
      },
      error: null,
    };
    renderDash();
    await waitFor(() => expect(screen.getByText("TM")).toBeInTheDocument());
  });

  it("renders meal pass with balance", () => {
    renderDash();
    expect(screen.getByText("Remaining Balance")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
  });
});
