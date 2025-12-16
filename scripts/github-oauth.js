#!/usr/bin/env node
/**
 * Minimal GitHub OAuth helper for Decap CMS (local use).
 *
 * Endpoints:
 *   GET /api/auth      → redirects to GitHub authorize URL
 *   GET /callback      → exchanges code for access token, posts it back, and closes the window
 *
 * Configure via environment variables:
 *   CLIENT_ID     (required) GitHub OAuth App client ID
 *   CLIENT_SECRET (required) GitHub OAuth App client secret
 *   PORT          (default 8081)
 *   URL           (default http://localhost:8080) — site origin allowed to receive postMessage
 *   SCOPE         (default public_repo)
 */
const http = require("http");
const https = require("https");
const { URL, URLSearchParams } = require("url");

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const PORT = Number(process.env.PORT) || 8081;
const SITE_URL = process.env.URL || "http://localhost:8080";
const SCOPE = process.env.SCOPE || "public_repo";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing CLIENT_ID or CLIENT_SECRET env vars.");
  process.exit(1);
}

const RESPONSE_HTML = (message) => `<!doctype html>
<html><body>
<script>
  (function() {
    function send(msg) {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(msg, "${SITE_URL}");
      }
      window.close();
    }
    send(${JSON.stringify(message)});
  })();
</script>
Close this window.
</body></html>`;

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    ...headers,
  });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

async function handleAuth(req, res) {
  const state = Math.random().toString(36).slice(2);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `http://localhost:${PORT}/callback`,
    scope: SCOPE,
    state,
  });
  redirect(res, `https://github.com/login/oauth/authorize?${params.toString()}`);
}

async function exchangeCode(code) {
  const postData = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    redirect_uri: `http://localhost:${PORT}/callback`,
  }).toString();

  const options = {
    method: "POST",
    hostname: "github.com",
    path: "/login/oauth/access_token",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(postData),
      Accept: "application/json",
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (resp) => {
      let data = "";
      resp.on("data", (chunk) => (data += chunk));
      resp.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error_description || parsed.error));
          } else {
            resolve(parsed.access_token);
          }
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function handleCallback(req, res, urlObj) {
  const code = urlObj.searchParams.get("code");
  if (!code) {
    return send(res, 400, RESPONSE_HTML("authorization:github:error:missing_code"));
  }

  try {
    const token = await exchangeCode(code);
    return send(res, 200, RESPONSE_HTML(`authorization:github:success:${token}`));
  } catch (err) {
    console.error("OAuth exchange failed:", err);
    return send(
      res,
      500,
      RESPONSE_HTML(`authorization:github:error:${err.message || "exchange_failed"}`)
    );
  }
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === "GET" && urlObj.pathname === "/api/auth") {
    return handleAuth(req, res);
  }
  if (req.method === "GET" && urlObj.pathname === "/callback") {
    return handleCallback(req, res, urlObj);
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`GitHub OAuth helper listening on http://localhost:${PORT}`);
  console.log(`Site origin allowed: ${SITE_URL}`);
});
