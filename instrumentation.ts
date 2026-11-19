import type { Instrumentation } from "next";
import { writeAppErrorLog } from "@/lib/error-log";

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const headers = new Headers();
  const contentType = request.headers["content-type"];
  const userAgent = request.headers["user-agent"];
  if (typeof contentType === "string") headers.set("content-type", contentType);
  if (typeof userAgent === "string") headers.set("user-agent", userAgent);

  const safeRequest = new Request(new URL(request.path, "http://outbox.internal"), {
    method: request.method,
    headers,
  });
  await writeAppErrorLog({
    request: safeRequest,
    error,
    responseStatus: 500,
    responseMessage: "We couldn’t complete that request. Please try again.",
    context: { route: context.routePath, routeType: context.routeType },
  });
};
