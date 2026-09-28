import { createServer } from "node:http";

const host = process.env.SUT_HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.SUT_PORT ?? "4173", 10);
const maximumBodyBytes = 1024 * 1024;

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(
    `SUT_PORT must be an integer between 1 and 65535; received ${process.env.SUT_PORT}`,
  );
}

const sendJson = (response, statusCode, value) => {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    "content-length": Buffer.byteLength(body),
    "content-type": "application/json; charset=utf-8",
  });
  response.end(body);
};

const readBody = async (request) => {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBodyBytes) {
      const error = new Error("Request body exceeds 1 MiB");
      error.code = "BODY_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return null;
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (request.headers["content-type"]?.includes("application/json")) {
    try {
      return JSON.parse(rawBody);
    } catch {
      return rawBody;
    }
  }

  return rawBody;
};

const server = createServer(async (request, response) => {
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? `${host}:${port}`}`,
  );

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (
    (request.method === "GET" || request.method === "POST") &&
    url.pathname === "/echo"
  ) {
    try {
      const body = await readBody(request);
      sendJson(response, 200, {
        method: request.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        headers: {
          accept: request.headers.accept ?? null,
          "content-type": request.headers["content-type"] ?? null,
          "user-agent": request.headers["user-agent"] ?? null,
        },
        body,
      });
    } catch (error) {
      const statusCode =
        error instanceof Error && error.code === "BODY_TOO_LARGE" ? 413 : 400;
      sendJson(response, statusCode, {
        error:
          error instanceof Error
            ? error.message
            : "Unable to read request body",
      });
    }
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Echo SUT listening at http://${host}:${port}`);
});

let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  const forceShutdown = setTimeout(() => {
    console.error(`Echo SUT did not stop after ${signal}`);
    process.exit(1);
  }, 5_000);
  forceShutdown.unref();

  server.close((error) => {
    clearTimeout(forceShutdown);
    if (error) {
      console.error(error);
      process.exit(1);
    }
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
