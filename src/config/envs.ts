import * as Joi from 'joi';
import * as dotenv from 'dotenv';

dotenv.config();

interface Ienvs {
  PORT: number;
  NODE_ENV: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_SECRET: string;
  JWT_REFRESH_EXPIRES_IN: string;
  SMTP_FROM: string;
  SMTP_RETRY_ATTEMPTS: number;
  /** Base del backoff exponencial entre reintentos, en ms. */
  SMTP_RETRY_BASE_DELAY_MS: number;
  RESEND_API_KEY: string;
  /**
   * Tope de espera de la llamada HTTP al proveedor de email. El SDK no impone
   * ninguno y su `catch` descarta el error original, así que sin este tope un
   * request colgado retiene el listener indefinidamente sin dejar rastro
   * (mismo motivo por el que se exigieron los timeouts SMTP en D-114).
   */
  MAIL_SEND_TIMEOUT_MS: number;
  API_URL: string;
  VERIFICATION_TOKEN_EXPIRY_HOURS: number;
  THROTTLE_TTL: number;
  THROTTLE_LIMIT: number;
  MAX_LOGIN_ATTEMPTS: number;
  ACCOUNT_LOCKOUT_MINUTES: number;
  CORS_ORIGIN: string;
  SUPER_ADMIN_EMAIL?: string;
  SUPER_ADMIN_PASS?: string;
  R2_REGION: string;
  R2_ENDPOINT?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
  R2_PUBLIC_URL?: string;
  B2_REGION: string;
  B2_ENDPOINT?: string;
  B2_KEY_ID?: string;
  B2_APP_KEY?: string;
  B2_BUCKET?: string;
  B2_PUBLIC_URL?: string;
  SIGNED_URL_EXPIRES_SECONDS: number;
  FRONTEND_URL: string;
}

const schema = Joi.object({
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  DATABASE_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('1500'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  JWT_REFRESH_SECRET: Joi.string().required(),
  RESEND_API_KEY: Joi.string().required(),
  MAIL_SEND_TIMEOUT_MS: Joi.number().default(15000),
  SMTP_FROM: Joi.string().required(),
  SMTP_RETRY_ATTEMPTS: Joi.number().integer().min(1).max(5).default(3),
  SMTP_RETRY_BASE_DELAY_MS: Joi.number().default(2000),
  API_URL: Joi.string().required(),
  VERIFICATION_TOKEN_EXPIRY_HOURS: Joi.number().default(24),
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(10),
  MAX_LOGIN_ATTEMPTS: Joi.number().default(5),
  ACCOUNT_LOCKOUT_MINUTES: Joi.number().default(15),
  CORS_ORIGIN: Joi.string().default('*'),
  SUPER_ADMIN_EMAIL: Joi.string().email().optional(),
  SUPER_ADMIN_PASS: Joi.string().optional(),
  R2_REGION: Joi.string().required(),
  R2_ENDPOINT: Joi.string().required(),
  R2_ACCESS_KEY_ID: Joi.string().required(),
  R2_SECRET_ACCESS_KEY: Joi.string().required(),
  R2_BUCKET: Joi.string().required(),
  R2_PUBLIC_URL: Joi.string().required(),
  B2_REGION: Joi.string().required(),
  B2_ENDPOINT: Joi.string().required(),
  B2_KEY_ID: Joi.string().required(),
  B2_APP_KEY: Joi.string().required(),
  B2_BUCKET: Joi.string().required(),
  B2_PUBLIC_URL: Joi.string().required(),
  SIGNED_URL_EXPIRES_SECONDS: Joi.number().default(3600),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),
}).unknown(true);

const { error, value: validatedEnvs } = schema.validate(process.env, {
  stripUnknown: true,
}) as { error?: Joi.ValidationError; value: Ienvs };

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export const envs: Ienvs = validatedEnvs;
