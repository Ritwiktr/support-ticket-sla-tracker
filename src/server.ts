import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSchema, createYoga } from "graphql-yoga";
import { env } from "./config";
import { prisma } from "./db/prisma";
import { resolvers } from "./graphql/resolvers/index";
import { readBearerToken, verifyToken } from "./auth/jwt";
import type { GraphQLContext } from "./auth/context";
import { yogaPlugins } from "./http/yogaPlugins";
import { logger } from "./observability/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const typeDefs = readFileSync(join(__dirname, "graphql/schema/schema.graphql"), "utf8");

const schema = createSchema<GraphQLContext>({
  typeDefs,
  resolvers,
});

const yoga = createYoga<GraphQLContext>({
  schema,
  graphqlEndpoint: "/graphql",
  graphiql: {
    title: "SLA Tracker",
    defaultQuery: `# Seed agent login. Run this, copy token, then add:
# Authorization: Bearer <token>
# in the Headers tab for dashboard / tickets.

mutation {
  login(email: "agent@example.com", password: "Password123!") {
    token
    user { id name role }
  }
}
`,
  },
  plugins: yogaPlugins,
  cors: {
    origin: [env.webOrigin, "http://localhost:5173", "http://localhost:5174"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  },
  context: ({ request }): GraphQLContext => {
    const token = readBearerToken(request.headers.get("authorization"));
    const user = token === null ? null : verifyToken(token);
    return { prisma, user };
  },
});

const server = createServer((req, res) => {
  const path = req.url?.split("?")[0] ?? "/";
  if (path === "/" || path === "") {
    res.writeHead(302, { Location: "/graphql" });
    res.end();
    return;
  }
  yoga(req, res);
});

server.listen(env.port, () => {
  logger.info("api.ready", { port: env.port, timezone: env.businessTimezone });
});

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
