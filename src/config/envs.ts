import * as Joi from 'joi';
import * as dotenv from 'dotenv';

dotenv.config();

interface Ienvs {
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASS: string;
  SMTP_FROM: string;
  API_URL: string;
  VERIFICATION_TOKEN_EXPIRY_HOURS: number;
  THROTTLE_TTL: number;
  THROTTLE_LIMIT: number;
  MAX_LOGIN_ATTEMPTS: number;
  ACCOUNT_LOCKOUT_MINUTES: number;
  SUPER_ADMIN_EMAIL?: string;
  SUPER_ADMIN_PASS?: string;
}

const schema = Joi.object({
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('1500'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().required(),
  SMTP_USER: Joi.string().required(),
  SMTP_PASS: Joi.string().required(),
  SMTP_FROM: Joi.string().required(),
  API_URL: Joi.string().required(),
  VERIFICATION_TOKEN_EXPIRY_HOURS: Joi.number().default(24),
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(10),
  MAX_LOGIN_ATTEMPTS: Joi.number().default(5),
  ACCOUNT_LOCKOUT_MINUTES: Joi.number().default(15),
  SUPER_ADMIN_EMAIL: Joi.string().email().optional(),
  SUPER_ADMIN_PASS: Joi.string().optional(),
}).unknown(true);

const { error, value: validatedEnvs } = schema.validate(process.env, {
  stripUnknown: true,
}) as { error?: Joi.ValidationError; value: Ienvs };

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export const envs: Ienvs = validatedEnvs;
