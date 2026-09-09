// Google Drive upload, ported from dune_board_game/v2's upload_to_cloud.py.
// Uses a "Desktop app" OAuth client so the loopback redirect flow works
// without pre-registering an exact port (same trick as Python's
// InstalledAppFlow.run_local_server(port=0)).

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { URL } from "node:url";
import { google } from "googleapis";

export function expandHome(p) {
  if (!p) return p;
  if (p === "~") return process.env.USERPROFILE ?? process.env.HOME ?? p;
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(process.env.USERPROFILE ?? process.env.HOME ?? "", p.slice(2));
  }
  return p;
}

function loadCredentials(credentialsPath) {
  const raw = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  const cfg = raw.installed ?? raw.web;
  if (!cfg) {
    throw new Error(
      `Could not find "installed" or "web" client config in ${credentialsPath}. ` +
        `Download a "Desktop app" OAuth client JSON from Google Cloud Console.`
    );
  }
  return cfg;
}

function authenticateInteractively(oAuth2Client, scopes, tokenPath) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, "http://127.0.0.1");
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");
        if (error) {
          res.end(`Authorization failed: ${error}. You can close this tab.`);
          server.close();
          reject(new Error(`Google OAuth error: ${error}`));
          return;
        }
        if (!code) return;

        res.end("Authorization complete. You can close this tab and return to the terminal.");
        server.close();

        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
        fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      // Desktop-app OAuth clients register "http://localhost" (no port) and
      // Google allows any port at auth time - but the host must match
      // exactly what's registered, so use "localhost" here, not "127.0.0.1".
      oAuth2Client.redirectUri = `http://localhost:${port}`;
      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: scopes,
      });
      console.log("\nAuthorize this app for Google Drive access by visiting this URL:\n");
      console.log(authUrl + "\n");
      console.log("Waiting for authorization...");
    });
  });
}

/**
 * @param {object} options
 * @param {string} options.credentialsPath - path to a "Desktop app" OAuth client JSON
 * @param {string} options.tokenPath - where to cache the resulting refresh token
 * @param {string[]} options.scopes
 */
export async function getDriveService({ credentialsPath, tokenPath, scopes }) {
  credentialsPath = expandHome(credentialsPath);
  tokenPath = expandHome(tokenPath);

  const { client_id, client_secret } = loadCredentials(credentialsPath);
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret);

  if (fs.existsSync(tokenPath)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(tokenPath, "utf8")));
  } else {
    await authenticateInteractively(oAuth2Client, scopes, tokenPath);
  }

  oAuth2Client.on("tokens", (tokens) => {
    const existing = fs.existsSync(tokenPath) ? JSON.parse(fs.readFileSync(tokenPath, "utf8")) : {};
    fs.writeFileSync(tokenPath, JSON.stringify({ ...existing, ...tokens }, null, 2));
  });

  return google.drive({ version: "v3", auth: oAuth2Client });
}

async function findExistingFileId(drive, filename, folderId) {
  const escaped = filename.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `name='${escaped}' and '${folderId}' in parents and trashed=false`,
    fields: "files(id, name)",
  });
  return res.data.files?.[0]?.id ?? null;
}

const MIME_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

/**
 * Upload (or overwrite) an image in a Drive folder and make it public.
 * @returns {Promise<{ fileId: string, viewLink: string, directLink: string }>}
 */
export async function uploadImage(drive, filePath, { folderId, makePublic = true }) {
  const filename = path.basename(filePath);
  const mimeType = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
  const media = { mimeType, body: fs.createReadStream(filePath) };

  const existingId = await findExistingFileId(drive, filename, folderId);

  let fileId;
  if (existingId) {
    await drive.files.update({ fileId: existingId, media });
    fileId = existingId;
    console.log(`Updated on Drive: ${filename}`);
  } else {
    const created = await drive.files.create({
      requestBody: { name: filename, parents: [folderId] },
      media,
      fields: "id",
    });
    fileId = created.data.id;
    console.log(`Uploaded to Drive: ${filename}`);
  }

  if (makePublic) {
    await drive.permissions.create({
      fileId,
      requestBody: { type: "anyone", role: "reader" },
    });
  }

  return {
    fileId,
    viewLink: `https://drive.google.com/file/d/${fileId}/view`,
    directLink: `https://drive.google.com/uc?export=download&id=${fileId}`,
  };
}
