CREATE TYPE "user_status" AS ENUM (
  'pending',
  'active',
  'suspended',
  'deleted'
);

CREATE TYPE "oauth_provider" AS ENUM (
  'google',
  'apple',
  'github',
  'microsoft',
  'facebook'
);

CREATE TYPE "member_status" AS ENUM (
  'pending',
  'active',
  'inactive',
  'suspended'
);

CREATE TYPE "invitation_status" AS ENUM (
  'pending',
  'accepted',
  'expired',
  'cancelled'
);

CREATE TYPE "subscription_status" AS ENUM (
  'trial',
  'active',
  'suspended',
  'cancelled',
  'expired'
);

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY,
  "first_name" varchar(100) NOT NULL,
  "last_name" varchar(100) NOT NULL,
  "email" varchar(255) NOT NULL,
  "phone" varchar(30),
  "avatar_url" varchar,
  "language" varchar(10) DEFAULT 'es',
  "timezone" varchar(60) DEFAULT 'America/Argentina/Buenos_Aires',
  "status" user_status DEFAULT 'pending',
  "email_verified_at" timestamp,
  "last_login_at" timestamp,
  "created_at" timestamp,
  "updated_at" timestamp,
  "deleted_at" timestamp
);

CREATE TABLE "user_credentials" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "password_hash" varchar NOT NULL,
  "password_changed_at" timestamp,
  "failed_attempts" int DEFAULT 0,
  "locked_until" timestamp,
  "created_at" timestamp,
  "updated_at" timestamp
);

CREATE TABLE "user_sessions" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "refresh_token" varchar NOT NULL,
  "ip_address" varchar(50),
  "user_agent" varchar,
  "device_name" varchar(120),
  "last_activity_at" timestamp,
  "expires_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp
);

CREATE TABLE "email_verifications" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "token" varchar NOT NULL,
  "expires_at" timestamp,
  "verified_at" timestamp,
  "created_at" timestamp
);

CREATE TABLE "password_resets" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "token" varchar NOT NULL,
  "expires_at" timestamp,
  "used_at" timestamp,
  "created_at" timestamp
);

CREATE TABLE "api_keys" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "name" varchar(120),
  "key_hash" varchar NOT NULL,
  "last_used_at" timestamp,
  "expires_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp
);

CREATE TABLE "oauth_accounts" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "provider" oauth_provider,
  "provider_user_id" varchar,
  "email" varchar,
  "created_at" timestamp,
  "updated_at" timestamp
);

CREATE TABLE "user_mfa" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "secret" varchar,
  "recovery_codes" json,
  "enabled_at" timestamp,
  "disabled_at" timestamp
);

CREATE TABLE "login_history" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid,
  "email" varchar,
  "ip_address" varchar,
  "user_agent" varchar,
  "success" boolean,
  "created_at" timestamp
);

CREATE TABLE "workshops" (
  "id" uuid PRIMARY KEY,
  "name" varchar(150) NOT NULL,
  "legal_name" varchar(200),
  "tax_id" varchar(30) UNIQUE,
  "email" varchar(255),
  "phone" varchar(30),
  "website" varchar(255),
  "logo_url" varchar,
  "description" text,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp,
  "updated_at" timestamp,
  "deleted_at" timestamp
);

CREATE TABLE "workshop_branches" (
  "id" uuid PRIMARY KEY,
  "workshop_id" uuid NOT NULL,
  "name" varchar(120),
  "phone" varchar(30),
  "email" varchar(255),
  "address" varchar,
  "city" varchar(120),
  "state" varchar(120),
  "postal_code" varchar(20),
  "latitude" decimal,
  "longitude" decimal,
  "is_headquarters" boolean,
  "is_active" boolean,
  "created_at" timestamp,
  "updated_at" timestamp
);

CREATE TABLE "workshop_roles" (
  "id" uuid PRIMARY KEY,
  "workshop_id" uuid NOT NULL,
  "code" varchar(50),
  "name" varchar(100),
  "description" text,
  "is_system" boolean,
  "created_at" timestamp
);

CREATE TABLE "workshop_members" (
  "id" uuid PRIMARY KEY,
  "workshop_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role_id" uuid NOT NULL,
  "default_branch_id" uuid,
  "joined_at" timestamp,
  "left_at" timestamp,
  "status" member_status,
  "created_at" timestamp,
  "updated_at" timestamp
);

CREATE TABLE "workshop_invitations" (
  "id" uuid PRIMARY KEY,
  "workshop_id" uuid,
  "email" varchar,
  "role_id" uuid,
  "invited_by" uuid,
  "token" varchar,
  "expires_at" timestamp,
  "accepted_at" timestamp,
  "status" invitation_status,
  "created_at" timestamp
);

CREATE TABLE "business_hours" (
  "id" uuid PRIMARY KEY,
  "branch_id" uuid,
  "weekday" int,
  "opens_at" time,
  "closes_at" time,
  "created_at" timestamp
);

CREATE TABLE "business_hour_exceptions" (
  "id" uuid PRIMARY KEY,
  "branch_id" uuid,
  "date" date,
  "is_closed" boolean,
  "opens_at" time,
  "closes_at" time,
  "reason" varchar,
  "created_at" timestamp
);

CREATE TABLE "specialties" (
  "id" uuid PRIMARY KEY,
  "code" varchar UNIQUE,
  "name" varchar,
  "description" text
);

CREATE TABLE "workshop_specialties" (
  "id" uuid PRIMARY KEY,
  "workshop_id" uuid,
  "specialty_id" uuid,
  "created_at" timestamp
);

CREATE TABLE "workshop_role_permissions" (
  "id" uuid PRIMARY KEY,
  "role_id" uuid,
  "permission_id" uuid
);

CREATE TABLE "subscriptions" (
  "id" uuid PRIMARY KEY,
  "workshop_id" uuid,
  "plan_id" uuid,
  "starts_at" date,
  "ends_at" date,
  "status" subscription_status,
  "created_at" timestamp
);

CREATE TABLE "plans" (
  "id" uuid PRIMARY KEY,
  "code" varchar UNIQUE,
  "name" varchar,
  "description" text,
  "max_members" int,
  "max_branches" int,
  "max_vehicles" int,
  "monthly_price" decimal,
  "yearly_price" decimal,
  "is_active" boolean
);

CREATE UNIQUE INDEX ON "users" ("email");

CREATE UNIQUE INDEX ON "user_credentials" ("user_id");

CREATE UNIQUE INDEX ON "user_sessions" ("refresh_token");

CREATE INDEX ON "user_sessions" ("user_id");

CREATE UNIQUE INDEX ON "email_verifications" ("token");

CREATE UNIQUE INDEX ON "password_resets" ("token");

CREATE UNIQUE INDEX ON "api_keys" ("key_hash");

CREATE UNIQUE INDEX ON "oauth_accounts" ("provider", "provider_user_id");

CREATE UNIQUE INDEX ON "user_mfa" ("user_id");

COMMENT ON TABLE "users" IS 'Representa una persona dentro del sistema.
Un usuario puede pertenecer a múltiples talleres.
';

COMMENT ON TABLE "user_credentials" IS 'Se separan las credenciales del usuario para permitir
futuros proveedores de autenticación.
';

ALTER TABLE "user_credentials" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "user_sessions" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "email_verifications" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "password_resets" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "api_keys" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "oauth_accounts" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "user_mfa" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "login_history" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "workshop_branches" ADD FOREIGN KEY ("workshop_id") REFERENCES "workshops" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "workshop_roles" ADD FOREIGN KEY ("workshop_id") REFERENCES "workshops" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "workshop_members" ADD FOREIGN KEY ("workshop_id") REFERENCES "workshops" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "workshop_members" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "workshop_members" ADD FOREIGN KEY ("role_id") REFERENCES "workshop_roles" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "workshop_members" ADD FOREIGN KEY ("default_branch_id") REFERENCES "workshop_branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "workshop_invitations" ADD FOREIGN KEY ("workshop_id") REFERENCES "workshops" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "workshop_invitations" ADD FOREIGN KEY ("role_id") REFERENCES "workshop_roles" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "workshop_invitations" ADD FOREIGN KEY ("invited_by") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "business_hours" ADD FOREIGN KEY ("branch_id") REFERENCES "workshop_branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "business_hour_exceptions" ADD FOREIGN KEY ("branch_id") REFERENCES "workshop_branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "workshop_specialties" ADD FOREIGN KEY ("workshop_id") REFERENCES "workshops" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "workshop_specialties" ADD FOREIGN KEY ("specialty_id") REFERENCES "specialties" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "workshop_role_permissions" ADD FOREIGN KEY ("role_id") REFERENCES "workshop_roles" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "subscriptions" ADD FOREIGN KEY ("workshop_id") REFERENCES "workshops" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "subscriptions" ADD FOREIGN KEY ("plan_id") REFERENCES "plans" ("id") DEFERRABLE INITIALLY IMMEDIATE;
