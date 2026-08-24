import { GraphQLError } from "graphql";
import { ErrorCode, type ErrorCodeName } from "../graphql/errors";

export class AppError extends GraphQLError {
  constructor(message: string, code: ErrorCodeName) {
    super(message, {
      extensions: { code },
    });
  }
}

export function unauthorized(): never {
  throw new AppError("Authentication required.", ErrorCode.UNAUTHORIZED);
}

export function forbidden(message = "You are not allowed to perform this action."): never {
  throw new AppError(message, ErrorCode.FORBIDDEN);
}
