import "server-only";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

type DriveConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  folderId: string;
};

function driveConfig(): DriveConfig {
  const config = {
    clientId: process.env.GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
    folderId: process.env.GOOGLE_DRIVE_SAMPLE_FOLDER_ID,
  };
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Falta configurar Google Drive (${missing.join(", ")})`);
  }
  return config as DriveConfig;
}

export function googleDriveConfigured() {
  return Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_ID &&
      process.env.GOOGLE_DRIVE_CLIENT_SECRET &&
      process.env.GOOGLE_DRIVE_REFRESH_TOKEN &&
      process.env.GOOGLE_DRIVE_SAMPLE_FOLDER_ID,
  );
}

async function accessToken() {
  const config = driveConfig();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
  };
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || `Google OAuth respondió ${response.status}`);
  }
  return body.access_token;
}

async function driveError(response: Response) {
  const message = await response.text().catch(() => "");
  return `Google Drive respondió ${response.status}: ${message.slice(0, 300)}`;
}

export async function uploadDriveArchive(input: {
  name: string;
  content: Buffer;
}): Promise<{ id: string; url: string }> {
  const config = driveConfig();
  const token = await accessToken();
  const boundary = `teravino_${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name: input.name, parents: [config.folderId] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: application/zip\r\n\r\n`),
    input.content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const response = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.byteLength),
      },
      body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error(await driveError(response));
  const file = (await response.json()) as { id?: string; webViewLink?: string };
  if (!file.id || !file.webViewLink) throw new Error("Google Drive no devolvió el enlace del archivo");
  return { id: file.id, url: file.webViewLink };
}

export async function shareDriveFileWithUser(fileId: string, email: string) {
  const token = await accessToken();
  const permissionsResponse = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true&fields=permissions(emailAddress,role,type)`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  if (permissionsResponse.ok) {
    const body = (await permissionsResponse.json()) as {
      permissions?: Array<{ emailAddress?: string; role?: string; type?: string }>;
    };
    const alreadyShared = body.permissions?.some(
      (permission) =>
        permission.type === "user" &&
        permission.emailAddress?.toLowerCase() === email.toLowerCase() &&
        ["reader", "commenter", "writer", "owner"].includes(permission.role || ""),
    );
    if (alreadyShared) return;
  }

  const response = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "user", role: "reader", emailAddress: email }),
      cache: "no-store",
    },
  );
  // Google puede responder conflicto cuando el permiso ya existe; el acceso
  // deseado está concedido y el flujo puede continuar con el correo.
  if (!response.ok && response.status !== 409) throw new Error(await driveError(response));
}
