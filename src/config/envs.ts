interface Ienvs {
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
}

export const envs: Ienvs = {
  PORT: 3000,
  DATABASE_URL:
    'postgresql://postgresuser:postgrespass@localhost:5432/desarrollo?schema=public',
  JWT_SECRET: 'follow-app-jwt-secret-dev',
  JWT_ACCESS_EXPIRES_IN: '1500',
  JWT_REFRESH_EXPIRES_IN: '7d',
};
