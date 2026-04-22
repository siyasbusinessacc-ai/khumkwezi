/**
 * Integration tests that validate the UI uses the *real* Supabase client
 * interface shape. Instead of mocking `@/integrations/supabase/client`, we
 * mock only the network transport (`fetch`) and let `@supabase/supabase-js`
 * actually build the URL, headers, method, and body.
 *
 * If the UI ever calls a non-existent chain method (e.g. `.match()` typo,
 * missing `.eq()`, wrong column name) or builds a malformed query, these
 * tests will fail because the captured request will not match the expected
 * REST shape.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

// `vi.hoisted` runs before `vi.mock` factories, so the factory can reference
// these bindings safely. We construct the *real* Supabase client here, wired
// to a fake fetch transport, so the UI exercises the real query builder.
const FAKE_URL = "https://fake.supabase.co";
const FAKE_KEY = "fake-anon-key";

const { captured, setNextResponse, realClient } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require("@supabase/supabase-js");

  const captured: CapturedRequest[] = [];
  let nextResponse: { status: number; body: unknown } = { status: 200, body: [] };

  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as URL | Request).toString();
    const headers: Record<string, string> = {};
    const setHeader = (k: string, v: string) => (headers[k.toLowerCase()] = v);
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => setHeader(k, v));
      } else if (Array.isArray(init.headers)) {
        for (const [k, v] of init.headers) setHeader(k, v);
      } else {
        for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
          setHeader(k, v);
        }
      }
    }
    let body: unknown = undefined;
    if (init?.body && typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    captured.push({
      url,
      method: (init?.method || "GET").toUpperCase(),
      headers,
      body,
    });
    const respBody =
      typeof nextResponse.body === "string"
        ? nextResponse.body
        : JSON.stringify(nextResponse.body);
    return new Response(respBody, {
      status: nextResponse.status,
      headers: { "Content-Type": "application/json" },
    });
  };

  const realClient = createClient("https://fake.supabase.co", "fake-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch as unknown as typeof fetch },
  });

  return {
    captured,
    setNextResponse: (r: { status: number; body: unknown }) => {
      nextResponse = r;
    },
    realClient,
  };
});

// Replace the project's supabase module with our real-but-fake-transport client.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: realClient,
}));

// Auth: pretend a user is signed in.
const userId = "11111111-1111-1111-1111-111111111111";
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "11111111-1111-1111-1111-111111111111" },
    signOut: vi.fn(),
  }),
}));

// Dashboard imports a few image assets — stub them.
vi.mock("@/assets/menu-ribeye.jpg", () => ({ default: "ribeye.jpg" }));
vi.mock("@/assets/menu-arancini.jpg", () => ({ default: "arancini.jpg" }));
vi.mock("@/assets/shisha-pairing.jpg", () => ({ default: "shisha.jpg" }));

// Imports that depend on the mocked modules above must come after.
import ProfilePage from "@/pages/ProfilePage";
import StudentDashboard from "@/components/StudentDashboard";

const renderWith = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  captured.length = 0;
  setNextResponse({ status: 200, body: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Integration: real Supabase query shape — ProfilePage fetch (.maybeSingle)", () => {
  it("issues GET /rest/v1/profiles?select=*&user_id=eq.<uuid> with maybeSingle headers", async () => {
    setNextResponse({
      status: 200,
      body: [
        {
          id: "p1",
          user_id: userId,
          name: "Thabo",
          surname: "Mokoena",
          student_number: "202301234",
          primary_phone: null,
          secondary_phone: null,
          email: "t@uni.ac.za",
          avatar_url: null,
          emergency_contact_name: null,
          emergency_contact_phone: null,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ],
    });

    renderWith(<ProfilePage />);

    await waitFor(() => expect(captured.length).toBeGreaterThan(0));

    const fetchReq = captured.find(
      (r) => r.method === "GET" && r.url.includes("/profiles"),
    );
    expect(fetchReq, "expected a GET /profiles request").toBeTruthy();

    const url = new URL(fetchReq!.url);
    expect(url.pathname).toBe("/rest/v1/profiles");
    expect(url.searchParams.get("select")).toBe("*");
    expect(url.searchParams.get("user_id")).toBe(`eq.${userId}`);

    // PostgREST single-row contract for .maybeSingle() in this supabase-js version:
    // - The client parses the array response itself, so it does NOT send
    //   `Accept: application/vnd.pgrst.object+json` (which would 406 on 0 rows).
    // - It also does NOT add `limit=1` to the query string.
    // This is what distinguishes .maybeSingle() from .single() on the wire.
    expect(fetchReq!.headers["accept"] ?? "").not.toMatch(/vnd\.pgrst\.object/);
    expect(url.searchParams.get("limit")).toBeNull();

    // apikey/auth header proves the real client is wired up.
    const apikey = fetchReq!.headers["apikey"] ?? fetchReq!.headers["Apikey"];
    expect(apikey).toBe(FAKE_KEY);
    expect(fetchReq!.headers["authorization"]).toBe(`Bearer ${FAKE_KEY}`);

    // UI populated → confirms the chain actually returned data the page consumed,
    // i.e. .maybeSingle() correctly unwrapped the single-element array.
    await waitFor(() => {
      expect(screen.getByDisplayValue("Thabo")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Mokoena")).toBeInTheDocument();
      expect(screen.getByDisplayValue("202301234")).toBeInTheDocument();
    });
  });
});

describe("Integration: real Supabase query shape — ProfilePage update", () => {
  it("issues PATCH /rest/v1/profiles?user_id=eq.<uuid> with the edited fields as the body", async () => {
    setNextResponse({
      status: 200,
      body: [
        {
          id: "p1",
          user_id: userId,
          name: null,
          surname: null,
          student_number: null,
          primary_phone: null,
          secondary_phone: null,
          email: null,
          avatar_url: null,
          emergency_contact_name: null,
          emergency_contact_phone: null,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ],
    });

    renderWith(<ProfilePage />);

    const nameInput = await screen.findByPlaceholderText("First name");
    const surnameInput = screen.getByPlaceholderText("Last name");
    const studentInput = screen.getByPlaceholderText("e.g. 202301234");

    fireEvent.change(nameInput, { target: { value: "Lerato" } });
    fireEvent.change(surnameInput, { target: { value: "Dube" } });
    fireEvent.change(studentInput, { target: { value: "202309999" } });

    setNextResponse({ status: 204, body: "" });

    const saveBtn = screen.getByRole("button", { name: /save profile/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => {
      expect(captured.some((r) => r.method === "PATCH")).toBe(true);
    });

    const patchReq = captured.find((r) => r.method === "PATCH")!;
    const url = new URL(patchReq.url);
    expect(url.pathname).toBe("/rest/v1/profiles");
    expect(url.searchParams.get("user_id")).toBe(`eq.${userId}`);
    // PATCH from .update().eq() must NOT carry select params (no chained .select()).
    expect(url.searchParams.get("select")).toBeNull();
    // No single-row coercion on the update path.
    expect(patchReq.headers["accept"] ?? "").not.toMatch(/vnd\.pgrst\.object/);

    expect(patchReq.body).toMatchObject({
      name: "Lerato",
      surname: "Dube",
      student_number: "202309999",
    });
    expect(patchReq.headers["apikey"]).toBe(FAKE_KEY);
    expect(patchReq.headers["content-type"]).toMatch(/application\/json/);
  });
});

describe("Integration: real Supabase query shape — StudentDashboard fetch", () => {
  it("uses .from('profiles').select('*').eq('user_id', id).maybeSingle() correctly", async () => {
    setNextResponse({
      status: 200,
      body: [
        {
          id: "p1",
          user_id: userId,
          name: "Sipho",
          surname: "Khumalo",
          student_number: null,
          primary_phone: null,
          secondary_phone: null,
          email: null,
          avatar_url: null,
          emergency_contact_name: null,
          emergency_contact_phone: null,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ],
    });

    renderWith(<StudentDashboard />);

    await waitFor(() =>
      expect(captured.some((r) => r.url.includes("/profiles"))).toBe(true),
    );

    const req = captured.find((r) => r.url.includes("/profiles"))!;
    const url = new URL(req.url);
    expect(req.method).toBe("GET");
    expect(url.pathname).toBe("/rest/v1/profiles");
    expect(url.searchParams.get("select")).toBe("*");
    expect(url.searchParams.get("user_id")).toBe(`eq.${userId}`);
    // .maybeSingle() in this supabase-js version unwraps client-side; it must
    // NOT request the PostgREST single-object representation (which 406s on 0 rows).
    expect(req.headers["accept"] ?? "").not.toMatch(/vnd\.pgrst\.object/);
    expect(url.searchParams.get("limit")).toBeNull();

    // Initials render only if .maybeSingle() actually unwrapped the array → "SK".
    await waitFor(() => expect(screen.getByText("SK")).toBeInTheDocument());
  });

  it("treats an empty array as null without erroring (.maybeSingle() 0-row contract)", async () => {
    // PostgREST returns [] when no row matches. .maybeSingle() must resolve
    // with data: null (not throw), which the dashboard renders as "?" initials.
    setNextResponse({ status: 200, body: [] });

    renderWith(<StudentDashboard />);

    await waitFor(() =>
      expect(captured.some((r) => r.url.includes("/profiles"))).toBe(true),
    );

    // No crash, fallback initials shown.
    await waitFor(() => expect(screen.getByText("?")).toBeInTheDocument());
  });
});

describe("Integration: PostgREST single-row contract — direct client probe", () => {
  // These tests exercise the supabase client directly (no UI) to lock in the
  // wire-level differences between .single(), .maybeSingle(), and a plain
  // select. If a future supabase-js upgrade changes this contract, the UI
  // tests above will need to change too — these probes will tell us first.
  it(".single() sends Accept: application/vnd.pgrst.object+json", async () => {
    setNextResponse({
      status: 200,
      body: { id: "p1", user_id: userId, name: "X", surname: "Y" },
    });

    const { error } = await realClient
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    expect(error).toBeNull();
    const req = captured.at(-1)!;
    expect(req.method).toBe("GET");
    expect(req.headers["accept"]).toMatch(/application\/vnd\.pgrst\.object\+json/);
  });

  it(".maybeSingle() does NOT send the pgrst.object Accept header", async () => {
    setNextResponse({ status: 200, body: [] });

    const { data, error } = await realClient
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    // 0 rows → data must be null, not an error.
    expect(error).toBeNull();
    expect(data).toBeNull();
    const req = captured.at(-1)!;
    expect(req.headers["accept"] ?? "").not.toMatch(/vnd\.pgrst\.object/);
  });

  it("plain .select() returns an array and uses no single-row coercion", async () => {
    setNextResponse({
      status: 200,
      body: [{ id: "p1", user_id: userId, name: "A", surname: "B" }],
    });

    const { data, error } = await realClient
      .from("profiles")
      .select("*")
      .eq("user_id", userId);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    const req = captured.at(-1)!;
    expect(req.headers["accept"] ?? "").not.toMatch(/vnd\.pgrst\.object/);
  });
});
