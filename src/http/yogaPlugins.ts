import { GraphQLError } from "graphql";
import type { Plugin } from "graphql-yoga";
import { env } from "../config";
import { ErrorCode } from "../graphql/errors";
import { logger } from "../observability/logger";
import type { GraphQLContext } from "../auth/context";
import { clientIp, isAuthOperation, takeToken } from "./rateLimit";

const AUTH_LIMIT = 20;
const AUTH_WINDOW_MS = 10 * 60_000;
const GENERAL_LIMIT = 300;
const GENERAL_WINDOW_MS = 60_000;

export const yogaPlugins: Plugin<GraphQLContext>[] = [
  {
    onParams({ request, params, setResult }) {
      if (env.rateLimitDisabled) {
        return;
      }
      if (params.operationName === "IntrospectionQuery") {
        return;
      }

      const ip = clientIp(request);
      const auth = isAuthOperation(params.query, params.operationName);
      const decision = takeToken(
        `${auth ? "auth" : "gql"}:${ip}`,
        auth ? AUTH_LIMIT : GENERAL_LIMIT,
        auth ? AUTH_WINDOW_MS : GENERAL_WINDOW_MS,
      );
      if (decision.ok) {
        return;
      }

      logger.warn("http.rate_limited", {
        ip,
        operation: params.operationName ?? (auth ? "auth" : "anonymous"),
        retryAfterSec: decision.retryAfterSec,
      });
      setResult({
        errors: [
          new GraphQLError("Too many requests. Try again shortly.", {
            extensions: { code: ErrorCode.RATE_LIMITED, retryAfterSec: decision.retryAfterSec },
          }),
        ],
      });
    },
    onExecute({ args }) {
      const started = Date.now();
      const operation = args.operationName ?? "anonymous";
      if (operation === "IntrospectionQuery") {
        return;
      }
      return {
        onExecuteDone() {
          logger.info("graphql.execute", {
            operation,
            ms: Date.now() - started,
            userId: args.contextValue.user?.id ?? null,
          });
        },
      };
    },
  },
];
