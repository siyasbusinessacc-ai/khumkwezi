import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudentDashboard from "@/components/StudentDashboard";

let profileResult: { data: any; error: any } = { data: null, error: null };

const makeChain = (finalValue: any) => {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => Promise.resolve(finalValue),
    maybeSingle: () => Promise.resolve(finalValue),
    insert: () => Promise.resolve(finalValue),
    then: (onFulfilled: any) => Promise.resolve(finalValue).then(onFulfilled),
  };
  return chain;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "profiles") return makeChain(profileResult);
      if (table === "subscriptions") return makeChain({ data: [], error: null });
      if (table === "meal_plans") return makeChain({ data: [], error: null });
      if (table === "user_roles") return makeChain({ data: [], error: null });
      if (table === "meal_redemptions") return makeChain({ data: null, error: null });
      return makeChain({ data: null, error: null });
    }),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

vi.mock("@/assets/menu-ribeye.jpg", () => ({ default: "ribeye.jpg" }));
vi.mock("@/assets/menu-arancini.jpg", () => ({ default: "arancini.jpg" }));
vi.mock("@/assets/shisha-pairing.jpg", () => ({ default: "shisha.jpg" }));
vi.mock("@/assets/khumkhwez-logo.png", () => ({ default: "logo.png" }));

const renderDash = () =>
  render(
    <MemoryRouter>
      <StudentDashboard />
    </MemoryRouter>
  );

describe("StudentDashboard", () => {
  beforeEach(() => {
    profileResult = { data: null, error: null };
  });

  it("renders a time-based greeting", () => {
    renderDash();
    const greetings = ["Good Morning", "Good Afternoon", "Good Evening"];
    expect(greetings.some((g) => screen.queryAllByText(new RegExp(g, "i")).length > 0)).toBe(true);
  });

  it("renders the brand heading", () => {
    renderDash();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Khumkhwez/);
  });

  it("shows plan selector when user has no subscription", async () => {
    renderDash();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Choose Your Plan/i })).toBeInTheDocument()
    );
  });

  it("shows initials in the SR-only badge once profile loads", async () => {
    profileResult = {
      data: { id: "p1", user_id: "u1", name: "Thabo", surname: "Mokoena" },
      error: null,
    };
    renderDash();
    await waitFor(() => expect(screen.getByTestId("user-initials")).toHaveTextContent("TM"));
  });
});
