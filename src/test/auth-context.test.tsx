import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const mockSignOut = vi.fn().mockResolvedValue({ error: null });
let authStateCallback: ((event: string, session: any) => void) | null = null;
const mockGetSession = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn((cb) => {
        authStateCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      getSession: () => mockGetSession(),
      signOut: () => mockSignOut(),
    },
  },
}));

const Probe = () => {
  const { user, session, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user?.id ?? "none"}</span>
      <span data-testid="session">{session ? "yes" : "no"}</span>
    </div>
  );
};

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
  });

  it("starts loading then resolves with no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByTestId("loading").textContent).toBe("true");
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("user").textContent).toBe("none");
  });

  it("provides user and session after sign-in event", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    const fakeSession = { user: { id: "user-123" } } as any;
    await act(async () => {
      authStateCallback?.("SIGNED_IN", fakeSession);
    });

    expect(screen.getByTestId("user").textContent).toBe("user-123");
    expect(screen.getByTestId("session").textContent).toBe("yes");
  });

  it("clears session on SIGNED_OUT event", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("u1"));

    await act(async () => {
      authStateCallback?.("SIGNED_OUT", null);
    });

    expect(screen.getByTestId("user").textContent).toBe("none");
  });

  it("calls supabase signOut when signOut is invoked", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    let signOutFn: () => Promise<void> = async () => {};
    const Capture = () => {
      const { signOut } = useAuth();
      signOutFn = signOut;
      return null;
    };
    render(<AuthProvider><Capture /></AuthProvider>);
    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    await signOutFn();
    expect(mockSignOut).toHaveBeenCalled();
  });
});
