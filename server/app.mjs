import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateIcebreakers, resolveAiProviderConfig } from "./visionClient.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 3000);
const MAX_BODY_SIZE = 32 * 1024;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  let totalLength = 0;

  for await (const chunk of request) {
    totalLength += chunk.length;
    if (totalLength > MAX_BODY_SIZE) {
      throw new Error("body_too_large");
    }
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(requestPath, response) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const relativePath = normalizedPath.replace(/^\/+/, "");
  const filePath = path.resolve(rootDir, relativePath);
  const relativeToRoot = path.relative(rootDir, filePath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    sendJson(response, 403, { error: "forbidden" });
    return;
  }

  try {
    await access(filePath);
  } catch {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "content-type": contentTypes[extension] || "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://localhost");

  if (request.method === "POST" && url.pathname === "/api/ai/icebreakers") {
    try {
      const body = await readJsonBody(request);
      const providerConfig = resolveAiProviderConfig();
      const result = await generateIcebreakers({
        viewerProfile: body.viewerProfile || {},
        candidateProfile: body.candidateProfile || {},
        recentMessages: Array.isArray(body.recentMessages) ? body.recentMessages : [],
        apiUrl: providerConfig.apiUrl,
        apiKey: providerConfig.apiKey
      });

      sendJson(response, 200, result);
      return;
    } catch (error) {
      if (error?.message && error.message !== "body_too_large") {
        console.error("ai_icebreakers_request_failed", error.message);
      }
      sendJson(response, error?.message === "body_too_large" ? 413 : 502, {
        suggestions: [],
        fallbackUsed: true,
        source: "fallback"
      });
      return;
    }
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }

  await serveStatic(url.pathname, response);
});

server.listen(port, () => {
  process.stdout.write(`Sanmao server listening on http://localhost:${port}\n`);
});
