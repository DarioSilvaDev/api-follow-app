import ky, { HTTPError, isHTTPError } from "ky";
import type { SessionUser } from "@/types/auth";

export { HTTPError, isHTTPError };

// ---------------------------------------------------------------------------
// Base API client — credentials: include for HttpOnly cookie auth (D-001)
// ---------------------------------------------------------------------------

let isRefreshing = false;
let refreshPromise: Promise<void> | null = null;

export const api = ky.create({
  prefix: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api",
  timeout: 10_000,
  credentials: "include",
  retry: { limit: 1, statusCodes: [401] },
  hooks: {
    beforeRetry: [
      async ({ error, retryCount }) => {
        // Only handle 401 on first retry — never on refresh itself
        if (
          retryCount !== 1 ||
          !isHTTPError(error) ||
          error.response.status !== 401
        ) {
          return ky.stop;
        }

        // Skip refresh for public auth endpoints
        try {
          const url = new URL(error.request.url);
          const path = url.pathname;
          const apiPrefix =
            process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
          const relativePath = path.replace(
            new URL(apiPrefix).pathname + "/",
            "",
          );
          const publicEndpoints = [
            "auth/login",
            "auth/refresh",
            "auth/logout",
            "auth/forgot-password",
            "auth/reset-password",
            "auth/register",
            "auth/verify-email",
          ];
          if (publicEndpoints.some((ep) => relativePath.startsWith(ep))) {
            return ky.stop;
          }
        } catch {
          // If URL parsing fails, allow refresh attempt
        }

        // Coordinate concurrent refreshes — only one refresh at a time
        if (isRefreshing && refreshPromise) {
          await refreshPromise;
          return; // Continue retry with updated cookies
        }

        isRefreshing = true;
        refreshPromise = api
          .post("auth/refresh")
          .then(() => {})
          .catch((refreshError: unknown) => {
            // Refresh failed → propagate error to stop retry
            throw refreshError;
          })
          .finally(() => {
            isRefreshing = false;
            refreshPromise = null;
          });

        try {
          await refreshPromise;
        } catch {
          // Refresh failed → throw original 401 so ky stops and caller gets error
          throw error;
        }
        // Refresh succeeded → continue with retry (new cookies in browser jar)
      },
    ],
  },
});

// ---------------------------------------------------------------------------
// Auth API methods
// ---------------------------------------------------------------------------

export interface LoginResponse {
  /**
   * Login body `{ user }` per contract — but the frontend does NOT rely on it.
   * Session data is always loaded via GET /auth/me (spec: RF-2).
   */
  user: unknown;
}

export const authApi = {
  login: (email: string, password: string) =>
    api
      .post("auth/login", { json: { email, password } })
      .json<LoginResponse>()
      .catch(async (error) => {
        if (isHTTPError(error)) {
          const status = error.response.status;
          let body: { message?: string; code?: string } = {};
          try {
            body = await error.response.json();
          } catch {
            // Response not JSON
          }
          throw { status, message: body.message, code: body.code };
        }
        throw error;
      }),

  logout: () =>
    api
      .post("auth/logout")
      .json<{ message: string }>()
      .catch(async (error) => {
        if (isHTTPError(error)) {
          const status = error.response.status;
          let body: { message?: string } = {};
          try {
            body = await error.response.json();
          } catch {
            // Response not JSON
          }
          throw { status, message: body.message };
        }
        throw error;
      }),

  me: () =>
    api
      .get("auth/me")
      .json<SessionUser>()
      .catch(async (error) => {
        if (isHTTPError(error)) {
          const status = error.response.status;
          let body: { message?: string; code?: string } = {};
          try {
            body = await error.response.json();
          } catch {
            // Response not JSON
          }
          throw { status, message: body.message, code: body.code };
        }
        throw error;
      }),

  register: (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) =>
    api
      .post("auth/register", { json: data })
      .json<{ message: string }>()
      .catch(async (error) => {
        if (isHTTPError(error)) {
          const status = error.response.status;
          let body: { message?: string; code?: string } = {};
          try {
            body = await error.response.json();
          } catch {
            // Response not JSON
          }
          throw { status, message: body.message, code: body.code };
        }
        throw error;
      }),

  verifyEmail: (token: string) =>
    api
      .get("auth/verify-email", { searchParams: { token } })
      .text()
      .catch(async (error) => {
        if (isHTTPError(error)) {
          const status = error.response.status;
          let body: { message?: string; code?: string } = {};
          try {
            body = await error.response.json();
          } catch {
            // Response not JSON — might be plain text
            try {
              const text = await error.response.text();
              throw { status, message: text };
            } catch {
              // Already thrown or not parseable
            }
          }
          throw { status, message: body.message, code: body.code };
        }
        throw error;
      }),

  forgotPassword: (email: string) =>
    api
      .post("auth/forgot-password", { json: { email } })
      .json<{ message: string }>()
      .catch(async (error) => {
        if (isHTTPError(error)) {
          const status = error.response.status;
          let body: { message?: string } = {};
          try {
            body = await error.response.json();
          } catch {
            // Response not JSON
          }
          throw { status, message: body.message };
        }
        throw error;
      }),

  resetPassword: (token: string, password: string) =>
    api
      .post("auth/reset-password", { json: { token, password } })
      .json<{ message: string }>()
      .catch(async (error) => {
        if (isHTTPError(error)) {
          const status = error.response.status;
          let body: { message?: string } = {};
          try {
            body = await error.response.json();
          } catch {
            // Response not JSON
          }
          throw { status, message: body.message };
        }
        throw error;
      }),

  changePassword: (currentPassword: string, newPassword: string) =>
    api
      .post("auth/change-password", { json: { currentPassword, newPassword } })
      .json<{ message: string }>()
      .catch(async (error) => {
        if (isHTTPError(error)) {
          const status = error.response.status;
          let body: { message?: string } = {};
          try {
            body = await error.response.json();
          } catch {
            // Response not JSON
          }
          throw { status, message: body.message };
        }
        throw error;
      }),
};
