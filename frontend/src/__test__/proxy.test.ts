/**
 * Tests for the route protection proxy (src/proxy.ts).
 *
 * The proxy is a pure function: NextRequest → NextResponse.
 * We test it directly without Next.js server internals.
 *
 * Key behaviors:
 * - Protected routes without access_token cookie → redirect to /login?next=<path>
 * - Auth routes (/login, /register) WITH cookie → redirect to /dashboard
 * - All other requests → pass through (NextResponse.next())
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a NextRequest with cookies set via the cookies API (not the Cookie
 * header), because happy-dom's Headers implementation does not expose
 * cookies through the `request.cookies` parser that NextRequest uses.
 */
function makeRequest(
  pathname: string,
  cookies?: Record<string, string>,
): NextRequest {
  const url = `http://localhost:3000${pathname}`;
  const req = new NextRequest(url);
  if (cookies) {
    for (const [key, value] of Object.entries(cookies)) {
      req.cookies.set(key, value);
    }
  }
  return req;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Proxy — route protection", () => {
  describe("protected routes", () => {
    it("redirects /dashboard to /login when no cookie", () => {
      const req = makeRequest("/dashboard");
      const res = proxy(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(res.headers.get("location")).toContain("/login");
      expect(res.headers.get("location")).toContain(
        encodeURIComponent("/dashboard"),
      );
    });

    it("redirects /dashboard/settings to /login with correct next param", () => {
      const req = makeRequest("/dashboard/settings");
      const res = proxy(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      const location = res.headers.get("location")!;
      expect(location).toContain("/login");
      expect(location).toContain(encodeURIComponent("/dashboard/settings"));
    });

    it("allows /dashboard when access_token cookie is present", () => {
      const req = makeRequest("/dashboard", { access_token: "valid-token" });
      const res = proxy(req);

      const location = res.headers.get("location");
      // Should NOT redirect to login
      expect(location).toBeNull();
      expect(res.status).not.toBe(307);
    });

    it("redirects /profile to /login when no cookie", () => {
      const req = makeRequest("/profile");
      const res = proxy(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(res.headers.get("location")).toContain("/login");
    });

    it("allows /profile when access_token cookie is present", () => {
      const req = makeRequest("/profile", { access_token: "valid" });
      const res = proxy(req);

      const location = res.headers.get("location");
      expect(location).toBeNull();
    });

    it("redirects /vehicles to /login when no cookie", () => {
      const req = makeRequest("/vehicles");
      const res = proxy(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(res.headers.get("location")).toContain("/login");
      expect(res.headers.get("location")).toContain(
        encodeURIComponent("/vehicles"),
      );
    });

    it("redirects /vehicles/new to /login with correct next param", () => {
      const req = makeRequest("/vehicles/new");
      const res = proxy(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      const location = res.headers.get("location")!;
      expect(location).toContain("/login");
      expect(location).toContain(encodeURIComponent("/vehicles/new"));
    });

    it("allows /vehicles when access_token cookie is present", () => {
      const req = makeRequest("/vehicles", { access_token: "valid-token" });
      const res = proxy(req);

      const location = res.headers.get("location");
      expect(location).toBeNull();
      expect(res.status).not.toBe(307);
    });

    // Fase 1 (D-078): /transferencias es ruta protegida.
    it("redirects /transferencias to /login when no cookie", () => {
      const req = makeRequest("/transferencias");
      const res = proxy(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(res.headers.get("location")).toContain("/login");
      expect(res.headers.get("location")).toContain(
        encodeURIComponent("/transferencias"),
      );
    });

    it("allows /transferencias when access_token cookie is present", () => {
      const req = makeRequest("/transferencias", { access_token: "valid" });
      const res = proxy(req);

      const location = res.headers.get("location");
      expect(location).toBeNull();
    });
  });

  describe("auth routes", () => {
    it("redirects /login to /dashboard when cookie is present", () => {
      const req = makeRequest("/login", { access_token: "valid-token" });
      const res = proxy(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(res.headers.get("location")).toContain("/dashboard");
    });

    it("redirects /register to /dashboard when cookie is present", () => {
      const req = makeRequest("/register", { access_token: "valid-token" });
      const res = proxy(req);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(res.headers.get("location")).toContain("/dashboard");
    });

    it("allows /login when no cookie is present", () => {
      const req = makeRequest("/login");
      const res = proxy(req);

      // Should pass through — no redirect to /dashboard
      const location = res.headers.get("location");
      expect(location).toBeNull();
    });
  });

  describe("public / non-matching routes", () => {
    it("passes through / (home) without cookie", () => {
      const req = makeRequest("/");
      const res = proxy(req);
      const location = res.headers.get("location");
      expect(location).toBeNull();
    });

    it("passes through /forgot-password", () => {
      const req = makeRequest("/forgot-password");
      const res = proxy(req);
      const location = res.headers.get("location");
      expect(location).toBeNull();
    });

    it("passes through /reset-password", () => {
      const req = makeRequest("/reset-password?token=abc");
      const res = proxy(req);
      const location = res.headers.get("location");
      expect(location).toBeNull();
    });
  });
});
