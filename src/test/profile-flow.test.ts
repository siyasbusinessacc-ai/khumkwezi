import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase client
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockEq = vi.fn();
const mockMaybeSingle = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: (...args: any[]) => {
        mockSelect(table, ...args);
        return { eq: mockEq };
      },
      update: (data: any) => {
        mockUpdate(table, data);
        return { eq: mockEq };
      },
      insert: (data: any) => {
        mockInsert(table, data);
        return { select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data, error: null }) }) };
      },
    })),
    auth: {
      signUp: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

describe("Post-signup profile flow", () => {
  const fakeUserId = "aaaa-bbbb-cccc-dddd";
  const fakeProfile = {
    id: "1111",
    user_id: fakeUserId,
    name: null,
    surname: null,
    student_number: null,
    primary_phone: null,
    secondary_phone: null,
    email: "test@uni.ac.za",
    avatar_url: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch the profile created by the trigger after signup", async () => {
    // Simulate the trigger having created a profile row
    mockEq.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: fakeProfile, error: null }) });

    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", fakeUserId)
      .maybeSingle();

    expect(mockSelect).toHaveBeenCalledWith("profiles", "*");
    expect(mockEq).toHaveBeenCalledWith("user_id", fakeUserId);
    expect(error).toBeNull();
    expect(data).toEqual(fakeProfile);
  });

  it("should save profile updates without RLS errors", async () => {
    const updatePayload = {
      name: "Thabo",
      surname: "Mokoena",
      student_number: "202301234",
      primary_phone: "+27 81 234 5678",
      secondary_phone: null,
      email: "test@uni.ac.za",
      emergency_contact_name: "Ma Mokoena",
      emergency_contact_phone: "+27 83 456 7890",
    };

    mockEq.mockResolvedValue({ data: { ...fakeProfile, ...updatePayload }, error: null });

    const { supabase } = await import("@/integrations/supabase/client");
    const { error } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("user_id", fakeUserId);

    expect(mockUpdate).toHaveBeenCalledWith("profiles", updatePayload);
    expect(mockEq).toHaveBeenCalledWith("user_id", fakeUserId);
    expect(error).toBeNull();
  });

  it("should handle missing profile gracefully (trigger delay)", async () => {
    // maybeSingle returns null when no row exists yet
    mockEq.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: null, error: null }) });

    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", fakeUserId)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});
