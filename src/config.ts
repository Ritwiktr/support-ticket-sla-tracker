import { config as loadEnv } from "dotenv";
import { DEFAULT_BUSINESS_HOURS } from "./services/sla/types";

loadEnv();

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  return value;
}

export const env = {
  databaseUrl: optional("DATABASE_URL", "postgresql://postgres:postgres@localhost:55432/sla_tracker"),
  jwtSecret: optional("JWT_SECRET", "dev-only-change-me"),
  businessTimezone: optional("BUSINESS_TIMEZONE", DEFAULT_BUSINESS_HOURS.timezone),
  port: Number.parseInt(optional("PORT", "4000"), 10),
  webOrigin: optional("WEB_ORIGIN", "http://localhost:5173"),
};

export const businessHoursConfig = {
  timezone: env.businessTimezone,
  startHour: DEFAULT_BUSINESS_HOURS.startHour,
  endHour: DEFAULT_BUSINESS_HOURS.endHour,
};
