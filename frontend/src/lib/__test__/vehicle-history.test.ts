/**
 * Unit tests for mergeHistory (F-014 / D-052, D-054, D-055 + iteración 2-3
 * D-069..D-071).
 *
 * Pure logic, no DOM: title building per source type, "Inicio de propiedad"
 * detection and desc chronological ordering.
 */
import { describe, it, expect } from "vitest";
import { mergeHistory } from "@/lib/vehicle-history";
import type {
  VehicleCareEpisode,
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
  return {
    transfers: [],
    mileages: [],
    ownerships: [],
    careEpisodes: [],
    ...overrides,
  };
}

function makeCareEpisode(
  overrides: Partial<VehicleCareEpisode> = {},
): VehicleCareEpisode {
  return {
    id: "c1",
    title: "Cambio de aceite",
    serviceDate: "2026-09-12T00:00:00.000Z",
    status: "delivered",
    source: "owner",
    verification: "unverified",
    mileageIn: 68500,
    customerNotes: null,
    checkedInAt: null,
    createdAt: "2026-09-12T10:00:00.000Z",
    workshop: null,
    workshopName: null,
    ...overrides,
  };
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

// ── Iteración 2-3: care episodes en el timeline (D-069..D-071) ──────────────

describe("mergeHistory — care episodes (iteración 2-3)", () => {
  it("mapea un episodio owner unverified con actor, badge y notas (D-071)", () => {
    const entries = mergeHistory(
      makeHistory({
        careEpisodes: [
          makeCareEpisode({ customerNotes: "Cambio de filtro" }),
        ],
      }),
    );

    expect(entries[0]).toMatchObject({
      id: "care:c1",
      type: "care",
      title: "Cambio de aceite",
      actor: "Registrado por el propietario",
      badge: "Pendiente de verificación",
      date: "2026-09-12T00:00:00.000Z",
      notes: "Cambio de filtro",
    });
  });

  it("owner verificado → actor 'Verificado por {taller}' usando workshop (D-071)", () => {
    const entries = mergeHistory(
      makeHistory({
        careEpisodes: [
          makeCareEpisode({
            verification: "verified",
            workshop: { id: "w1", name: "Taller Integral" },
          }),
        ],
      }),
    );

    expect(entries[0].actor).toBe("Verificado por Taller Integral");
    expect(entries[0].badge).toBeUndefined();
  });

  it("owner verificado con taller externo (solo workshopName) → 'Verificado por {taller}' (D-071)", () => {
    const entries = mergeHistory(
      makeHistory({
        careEpisodes: [
          makeCareEpisode({
            verification: "verified",
            workshop: null,
            workshopName: "Taller Libre",
          }),
        ],
      }),
    );

    expect(entries[0].actor).toBe("Verificado por Taller Libre");
  });

  it("workshop con title null → 'Atención de taller' y actor 'Taller {name}' (D-071)", () => {
    const entries = mergeHistory(
      makeHistory({
        careEpisodes: [
          makeCareEpisode({
            title: null,
            source: "workshop",
            workshop: { id: "w1", name: "Lubricentro Central" },
          }),
        ],
      }),
    );

    expect(entries[0].title).toBe("Atención de taller");
    expect(entries[0].actor).toBe("Taller Lubricentro Central");
    expect(entries[0].badge).toBeUndefined();
  });

  it("owner con title null → 'Servicio registrado' (D-071)", () => {
    const entries = mergeHistory(
      makeHistory({
        careEpisodes: [makeCareEpisode({ title: null, source: "owner" })],
      }),
    );

    expect(entries[0].title).toBe("Servicio registrado");
    expect(entries[0].actor).toBe("Registrado por el propietario");
  });

  it("status cancelled → sufijo '(cancelada)' en el título (D-071/D-054)", () => {
    const entries = mergeHistory(
      makeHistory({
        careEpisodes: [
          makeCareEpisode({
            title: "Reparación de frenos",
            status: "cancelled",
            source: "workshop",
          }),
        ],
      }),
    );

    expect(entries[0].title).toBe("Reparación de frenos (cancelada)");
  });

  it("date = D-070: serviceDate gana; si no checkedInAt; si no createdAt", () => {
    const withServiceDate = mergeHistory(
      makeHistory({
        careEpisodes: [
          makeCareEpisode({
            id: "c-sd",
            serviceDate: "2026-09-12T00:00:00.000Z",
            checkedInAt: "2026-09-10T00:00:00.000Z",
            createdAt: "2026-09-09T00:00:00.000Z",
          }),
        ],
      }),
    );
    expect(withServiceDate[0].date).toBe("2026-09-12T00:00:00.000Z");

    const withCheckedIn = mergeHistory(
      makeHistory({
        careEpisodes: [
          makeCareEpisode({
            id: "c-ci",
            serviceDate: null,
            checkedInAt: "2026-09-10T00:00:00.000Z",
            createdAt: "2026-09-09T00:00:00.000Z",
          }),
        ],
      }),
    );
    expect(withCheckedIn[0].date).toBe("2026-09-10T00:00:00.000Z");

    const withCreated = mergeHistory(
      makeHistory({
        careEpisodes: [
          makeCareEpisode({
            id: "c-created",
            serviceDate: null,
            checkedInAt: null,
            createdAt: "2026-09-09T00:00:00.000Z",
          }),
        ],
      }),
    );
    expect(withCreated[0].date).toBe("2026-09-09T00:00:00.000Z");
  });

  it("owner con taller asignado pero unverified → NUNCA 'Verificado por' (TL §3.3)", () => {
    const entries = mergeHistory(
      makeHistory({
        careEpisodes: [
          makeCareEpisode({
            workshop: { id: "w1", name: "Taller Integral" },
          }),
        ],
      }),
    );

    expect(entries[0].actor).toBe("Registrado por el propietario");
    expect(entries[0].badge).toBe("Pendiente de verificación");
    expect(JSON.stringify(entries[0])).not.toContain("Verificado por");
  });

  it("merge global desc con las 4 fuentes mezcladas (D-052 / D-070)", () => {
    const entries = mergeHistory(
      makeHistory({
        transfers: [
          makeTransfer({ id: "t1", createdAt: "2026-09-11T00:00:00.000Z" }),
        ],
        mileages: [
          {
            id: "m1",
            vehicleId: "v1",
            mileage: 80000,
            source: "workshop",
            notes: null,
            recordedAt: "2026-09-10T00:00:00.000Z",
            createdAt: "2026-09-10T00:00:00.000Z",
          },
        ],
        ownerships: [
          makeOwnership({ id: "o1", startsAt: "2026-09-01T00:00:00.000Z" }),
        ],
        careEpisodes: [
          makeCareEpisode({ id: "c1", serviceDate: "2026-09-12T00:00:00.000Z" }),
        ],
      }),
    );

    expect(entries.map((e) => e.id)).toEqual([
      "care:c1",
      "transfer:t1",
      "mileage:m1",
      "ownership:o1",
    ]);
  });

  it("empates exactos conservan el orden de inserción (transfers → mileages → ownerships → cares)", () => {
    const sameDate = "2026-09-10T00:00:00.000Z";
    const entries = mergeHistory(
      makeHistory({
        transfers: [makeTransfer({ id: "t1", createdAt: sameDate })],
        mileages: [
          {
            id: "m1",
            vehicleId: "v1",
            mileage: 50000,
            source: "owner",
            notes: null,
            recordedAt: sameDate,
            createdAt: sameDate,
          },
        ],
        ownerships: [makeOwnership({ id: "o1", startsAt: sameDate })],
        careEpisodes: [makeCareEpisode({ id: "c1", serviceDate: sameDate })],
      }),
    );

    expect(entries.map((e) => e.id)).toEqual([
      "transfer:t1",
      "mileage:m1",
      "ownership:o1",
      "care:c1",
    ]);
  });

  it("careEpisodes ausente en runtime (backend viejo) → [] defensivo sin romper", () => {
    const entries = mergeHistory({
      transfers: [],
      mileages: [],
      ownerships: [],
    } as unknown as VehicleHistoryResponse);

    expect(entries).toEqual([]);
  });
});

// ── Iteración 2-4: deep-link al detalle del servicio (careId) ────────────────

describe("mergeHistory — careId para deep-link (iteración 2-4)", () => {
  it("una entrada de tipo care expone careId = id SIN prefijo (para /vehicles/:id/servicios/:careId)", () => {
    const entries = mergeHistory(
      makeHistory({
        careEpisodes: [makeCareEpisode()],
      }),
    );

    expect(entries[0].id).toBe("care:c1");
    expect(entries[0].careId).toBe("c1");
  });

  it("las entradas no-care (transfer/mileage/ownership) NO exponen careId", () => {
    const entries = mergeHistory(
      makeHistory({
        transfers: [makeTransfer({ id: "t1" })],
        mileages: [
          {
            id: "m1",
            vehicleId: "v1",
            mileage: 25000,
            source: "owner",
            notes: null,
            recordedAt: "2026-09-10T00:00:00.000Z",
            createdAt: "2026-09-10T00:00:00.000Z",
          },
        ],
        ownerships: [makeOwnership({ id: "o1" })],
      }),
    );

    for (const entry of entries) {
      expect(entry.careId).toBeUndefined();
    }
    expect(JSON.stringify(entries)).not.toContain('"careId"');
  });

  it("careId viaja con el episodio aunque el badge/título cambien (workshop verificado)", () => {
    const entries = mergeHistory(
      makeHistory({
        careEpisodes: [
          makeCareEpisode({
            verification: "verified",
            workshop: { id: "w1", name: "Taller Integral" },
          }),
        ],
      }),
    );

    expect(entries[0].careId).toBe("c1");
  });
});