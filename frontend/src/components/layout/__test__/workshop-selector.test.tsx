/**
 * Tests for the WorkshopSelector (header dropdown) — F-020 / P2-6 / RF-3.
 *
 * Critical behaviors:
 * - Renders the user's workshopMemberships (workshop name + role).
 * - Selecting a workshop activates the WORKSHOP active context.
 * - Returning to "Personal" clears the context.
 * - Renders null when the user has no memberships (PERSONAL journey intact).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WorkshopSelector } from "@/components/layout/workshop-selector";
import {
  clearWorkshop,
  getActiveContext,
  selectWorkshop,
} from "@/lib/active-context";

// ── Mocks (must be before dynamic imports) ───────────────────────────────────

const mockUseAuth = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => mockUseAuth(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMemberships() {
  return [
    {
      workshopId: "w1",
      workshop: { id: "w1", name: "Taller Mecánico Central" },
      role: { id: "r1", code: "owner", name: "Dueño" },
    },
    {
      workshopId: "w2",
      workshop: { id: "w2", name: "Taller Sur" },
      role: { id: "r2", code: "mechanic", name: "Mecánico" },
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  clearWorkshop();
  mockUseAuth.mockReturnValue({
    user: { id: "user-1", workshopMemberships: makeMemberships() },
    status: "authenticated",
  });
});

afterEach(() => {
  vi.clearAllMocks();
  clearWorkshop();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("WorkshopSelector (F-020 / P2-6)", () => {
  it("renders the memberships with workshop name and role", () => {
    render(<WorkshopSelector />);

    const select = screen.getByLabelText(/contexto de trabajo/i);
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Personal" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Taller Mecánico Central/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Taller Sur/ })).toBeInTheDocument();
  });

  it("selecting a workshop activates the WORKSHOP context", () => {
    render(<WorkshopSelector />);

    fireEvent.change(screen.getByLabelText(/contexto de trabajo/i), {
      target: { value: "w1" },
    });

    expect(getActiveContext()).toEqual({ type: "WORKSHOP", workshopId: "w1" });
  });

  it("shows the currently selected workshop as the select value", () => {
    selectWorkshop("w2");
    render(<WorkshopSelector />);

    const select = screen.getByLabelText(/contexto de trabajo/i) as HTMLSelectElement;
    expect(select.value).toBe("w2");
  });

  it("returning to Personal clears the context", () => {
    selectWorkshop("w1");
    render(<WorkshopSelector />);

    fireEvent.change(screen.getByLabelText(/contexto de trabajo/i), {
      target: { value: "" },
    });

    expect(getActiveContext()).toBeNull();
  });

  it("renders null when the user has no workshop memberships", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "user-1", workshopMemberships: [] },
      status: "authenticated",
    });

    const { container } = render(<WorkshopSelector />);
    expect(screen.queryByLabelText(/contexto de trabajo/i)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});