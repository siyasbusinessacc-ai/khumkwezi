import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AuthPage from "@/pages/AuthPage";

const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignInWithOtp = vi.fn();
const mockVerifyOtp = vi.fn();
const mockNavigate = vi.fn();
const mockToast = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signUp: (...a: any[]) => mockSignUp(...a),
      signInWithPassword: (...a: any[]) => mockSignInWithPassword(...a),
      signInWithOtp: (...a: any[]) => mockSignInWithOtp(...a),
      verifyOtp: (...a: any[]) => mockVerifyOtp(...a),
    },
  },
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
      <AuthPage />
    </MemoryRouter>
  );

describe("AuthPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders email form by default", () => {
    renderPage();
    expect(screen.getByPlaceholderText("Email address")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
  });

  it("toggles to phone method", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Phone" }));
    expect(screen.getByPlaceholderText("+27 81 234 5678")).toBeInTheDocument();
  });

  it("toggles between login and signup modes", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(screen.getByRole("button", { name: "Create Account" })).toBeInTheDocument();
  });

  it("calls signInWithPassword on email login submit", async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null });
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("Email address"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    await waitFor(() =>
      expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: "a@b.com", password: "secret123" })
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"));
  });

  it("calls signUp on email signup submit", async () => {
    mockSignUp.mockResolvedValue({ error: null });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    fireEvent.change(screen.getByPlaceholderText("Email address"), { target: { value: "new@b.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    await waitFor(() =>
      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({ email: "new@b.com", password: "secret123" })
      )
    );
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Check your email" }));
  });

  it("shows error toast when login fails", async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: "Invalid credentials" } });
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("Email address"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "wrong1" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Error", variant: "destructive" })
      )
    );
  });

  it("phone flow sends OTP then verifies", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null });
    mockVerifyOtp.mockResolvedValue({ error: null });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Phone" }));
    fireEvent.change(screen.getByPlaceholderText("+27 81 234 5678"), { target: { value: "+27811112222" } });
    fireEvent.click(screen.getByRole("button", { name: "Send OTP" }));
    await waitFor(() => expect(mockSignInWithOtp).toHaveBeenCalledWith({ phone: "+27811112222" }));

    await waitFor(() => expect(screen.getByPlaceholderText("123456")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("123456"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify & Enter" }));
    await waitFor(() =>
      expect(mockVerifyOtp).toHaveBeenCalledWith(
        expect.objectContaining({ phone: "+27811112222", token: "654321" })
      )
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"));
  });
});
