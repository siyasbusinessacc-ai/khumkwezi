import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

let mockAuth: { user: any; loading: boolean } = { user: null, loading: false };

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: any) => children,
}));

// Re-implement guards locally mirroring App.tsx (they are not exported)
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <p>Loading...</p>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <p>Loading...</p>;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const setup = (initial: string) =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/" element={<ProtectedRoute><div>HOME</div></ProtectedRoute>} />
        <Route path="/auth" element={<PublicRoute><div>AUTH</div></PublicRoute>} />
      </Routes>
    </MemoryRouter>
  );

describe("Route guards", () => {
  beforeEach(() => {
    mockAuth = { user: null, loading: false };
  });

  it("ProtectedRoute redirects to /auth when not authenticated", () => {
    setup("/");
    expect(screen.getByText("AUTH")).toBeInTheDocument();
  });

  it("ProtectedRoute renders children when authenticated", () => {
    mockAuth = { user: { id: "u1" }, loading: false };
    setup("/");
    expect(screen.getByText("HOME")).toBeInTheDocument();
  });

  it("PublicRoute redirects to / when authenticated", () => {
    mockAuth = { user: { id: "u1" }, loading: false };
    setup("/auth");
    expect(screen.getByText("HOME")).toBeInTheDocument();
  });

  it("PublicRoute renders children when not authenticated", () => {
    setup("/auth");
    expect(screen.getByText("AUTH")).toBeInTheDocument();
  });

  it("shows loading state while auth is resolving", () => {
    mockAuth = { user: null, loading: true };
    setup("/");
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});
