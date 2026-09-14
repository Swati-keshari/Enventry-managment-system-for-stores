import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/supabase", () => ({
  createServerClient: vi.fn(),
  createServiceClient: vi.fn(),
}));

import { createServerClient } from "../../src/lib/supabase";
import { requireSuperAdmin } from "../../src/lib/auth";
import { PermissionError } from "../../src/lib/errors";

const mockedCreateServerClient = vi.mocked(createServerClient);

function mockAuthUser(email: string | null) {
  mockedCreateServerClient.mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: email
            ? {
                id: "auth-user-1",
                email,
                user_metadata: { full_name: "Test" },
              }
            : null,
        },
        error: email ? null : { message: "no user" },
      }),
    },
  } as never);
}

describe("requireSuperAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows allowlisted email", async () => {
    mockAuthUser("keshariswati511@gmail.com");
    const identity = await requireSuperAdmin(new Request("http://localhost"));
    expect(identity.isSuperAdmin).toBe(true);
    expect(identity.email).toBe("keshariswati511@gmail.com");
  });

  it("rejects non-allowlisted email", async () => {
    mockAuthUser("outsider@example.com");
    await expect(
      requireSuperAdmin(new Request("http://localhost")),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("rejects unauthenticated request", async () => {
    mockAuthUser(null);
    await expect(
      requireSuperAdmin(new Request("http://localhost")),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});
