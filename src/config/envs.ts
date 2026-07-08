interface Ienvs {
    PORT: number;
    DATABASE_URL: string;
}

export const envs: Ienvs = {
    PORT: 3000,
    DATABASE_URL: "postgresql://postgresuser:postgrespass@localhost:5432/desarrollo?schema=public"
}