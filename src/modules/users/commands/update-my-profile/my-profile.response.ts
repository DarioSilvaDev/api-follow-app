/**
 * Shape público del perfil editable (PATCH /users/me y respuesta no-op).
 * El frontend refresca la sesión completa con GET /auth/me tras guardar;
 * este shape es solo el eco inmediato de lo persistido.
 */
export interface MyProfileResponse {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  phoneAreaCode: string;
  phoneNationalNumber: string;
}
