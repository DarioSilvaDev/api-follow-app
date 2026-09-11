/**
 * Unit tests for mergeHistory (F-014 / D-052, D-054, D-055).
 *
 * Pure logic, no DOM: title building per source type, "Inicio de propiedad"
 * detection and desc chronological ordering.
 */
import { describe, it, expect } from "vitest";
import { mergeHistory } from "@/lib/vehicle-history";
import type {
  VehicleHistoryResponse,
  VehicleOwnership,
  VehicleTransfer,
} from "@/types/vehicle";

function makeTransfer(overrides: Partial<VehicleTransfer> = {}): VehicleTransfer {
  return {
    id: "t1",
    vehicleId: "v1",
    fromUser: { id: "u1", firstName: "Juan", lastName: "Perez" },
    toUser: { id: "u2", firstName: "Maria", lastName: "Lopez" },
    status: "completed",
    requestedAt: "2026-09-09T00:00:00.000Z",
    respondedAt: "2026-09-10T00:00:00.000Z",
    completedAt: "2026-09-10T00:00:00.000Z",
    expiresAt: null,
    notes: null,
    createdAt: "2026-09-09T00:00:00.000Z",
    ...overrides,
  };
}

function makeOwnership(overrides: Partial<VehicleOwnership> = {}): VehicleOwnership {
  return {
    id: "o1",
    vehicleId: "v1",
    userId: "u1",
    type: "owner",
    startsAt: "2026-09-01T00:00:00.000Z",
    endsAt: null,
    user: { id: "u1", firstName: "Juan", lastName: "Perez" },
    ...overrides,
  };
}

function makeHistory(
  overrides: Partial<VehicleHistoryResponse> = {},
): VehicleHistoryResponse {
  return { transfers: [], mileages: [], ownerships: [], ...overrides };
}

const kmLabel = (n: number) => n.toLocaleString("es-AR");

describe("mergeHistory (F-014 / D-052)", () => {
  it("mapea una transferencia completada (D-054)", () => {
    const entries = mergeHistory(
      makeHistory({
        transfers: [
          makeTransfer({ notes: "Entrega presencial" }),
        ],
      }),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "transfer:t1",
      type: "transfer",
      title: "Transferencia completada",
      actor: "De Juan Perez a Maria Lopez",
      date: "2026-09-09T00:00:00.000Z",
      notes: "Entrega presencial",
    });
  });

  it.each([
    ["pending", "pendiente"],
    ["accepted", "aceptada"],
    ["rejected", "rechazada"],
    ["cancelled", "cancelada"],
    ["expired", "expirada"],
  ])("mapea transfer %s → 'Transferencia %s'", (status, label) => {
    const entries = mergeHistory(
      makeHistory({
        transfers: [
          makeTransfer({ status: status as VehicleTransfer["status"] }),
        ],
      }),
    );
    expect(entries[0].title).toBe(`Transferencia ${label}`);
  });

  it("mapea un kilometraje con km, source y notas", () => {
    const entries = mergeHistory(
      makeHistory({
        mileages: [
          {
            id: "m1",
            vehicleId: "v1",
            mileage: 25000,
            source: "owner",
            notes: "Cambio de aceite",
            recordedAt: "2026-09-10T00:00:00.000Z",
            createdAt: "2026-09-10T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(entries[0]).toMatchObject({
      id: "mileage:m1",
      type: "mileage",
      title: `${kmLabel(25000)} km registrado`,
      actor: "Propietario",
      date: "2026-09-10T00:00:00.000Z",
      notes: "Cambio de aceite",
    });
  });

  it("el primer ownership es 'Inicio de propiedad' y los siguientes 'Propiedad transferida a …' (D-055)", () => {
    const entries = mergeHistory(
      makeHistory({
        ownerships: [
          makeOwnership(),
          makeOwnership({
            id: "o2",
            userId: "u2",
            startsAt: "2026-09-09T00:00:00.000Z",
            user: { id: "u2", firstName: "Maria", lastName: "Lopez" },
          }),
        ],
      }),
    );

    expect(entries).toHaveLength(2);
    const inicio = entries.find((e) => e.id === "ownership:o1");
    const transferido = entries.find((e) => e.id === "ownership:o2");
    expect(inicio?.title).toBe("Inicio de propiedad");
    expect(transferido?.title).toBe("Propiedad transferida a Maria Lopez");
    expect(transferido?.actor).toBe("Maria Lopez");
  });

  it("la lógica de 'primero' usa el ownership más antiguo aunque el backend llegue desc", () => {
    const entries = mergeHistory(
      makeHistory({
        ownerships: [
          // Backend ordena desc por startsAt — o2 (nuevo) primero.
          makeOwnership({
            id: "o2",
            userId: "u2",
            startsAt: "2026-09-09T00:00:00.000Z",
            user: { id: "u2", firstName: "Maria", lastName: "Lopez" },
          }),
          makeOwnership(),
        ],
      }),
    );

    expect(entries.find((e) => e.id === "ownership:o1")?.title).toBe(
      "Inicio de propiedad",
    );
    expect(entries.find((e) => e.id === "ownership:o2")?.title).toBe(
      "Propiedad transferida a Maria Lopez",
    );
  });

  it("ordena cronológicamente desc (más reciente primero) (D-052)", () => {
    const entries = mergeHistory(
      makeHistory({
        transfers: [
          makeTransfer({
            id: "t1",
            createdAt: "2026-09-11T12:00:00.000Z",
          }),
        ],
        mileages: [
          {
            id: "m1",
            vehicleId: "v1",
            mileage: 80000,
            source: "workshop",
            notes: null,
            recordedAt: "2026-09-10T12:00:00.000Z",
            createdAt: "2026-09-10T12:00:00.000Z",
          },
        ],
        ownerships: [
          makeOwnership({
            id: "o2",
            startsAt: "2026-09-09T00:00:00.000Z",
            userId: "u2",
            user: { id: "u2", firstName: "Maria", lastName: "Lopez" },
          }),
          makeOwnership(),
        ],
      }),
    );

    expect(entries.map((e) => e.id)).toEqual([
      "transfer:t1",
      "mileage:m1",
      "ownership:o2",
      "ownership:o1",
    ]);
    // El más reciente va primero.
    expect(entries[0].id).toBe("transfer:t1");
    expect(entries[entries.length - 1].id).toBe("ownership:o1");
  });

  it("devuelve [] cuando no hay eventos", () => {
    expect(mergeHistory(makeHistory())).toEqual([]);
  });
});