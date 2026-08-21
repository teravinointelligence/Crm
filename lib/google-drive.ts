import "server-only";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const TECHNICAL_SHEETS_FOLDER = "Fichas Técnicas TERAVINO";

type DriveConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  folderId: string;
  technicalSheetsFolderId?: string;
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
  return {
    ...(config as DriveConfig),
    technicalSheetsFolderId: process.env.GOOGLE_DRIVE_TECHNICAL_SHEETS_FOLDER_ID || undefined,
  };
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

function driveQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export type DriveTechnicalSheet = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  md5Checksum: string | null;
  size: number | null;
  webViewLink: string;
};

export async function ensureTechnicalSheetsDriveFolder(): Promise<{
  id: string;
  name: string;
  url: string;
}> {
  const config = driveConfig();
  const token = await accessToken();
  if (config.technicalSheetsFolderId) {
    const response = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(config.technicalSheetsFolderId)}?supportsAllDrives=true&fields=id,name,mimeType,webViewLink`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(
        `${await driveError(response)}. Confirma la carpeta y autoriza Drive con acceso de lectura.`,
      );
    }
    const folder = (await response.json()) as {
      id?: string;
      name?: string;
      mimeType?: string;
      webViewLink?: string;
    };
    if (!folder.id || folder.mimeType !== "application/vnd.google-apps.folder") {
      throw new Error("GOOGLE_DRIVE_TECHNICAL_SHEETS_FOLDER_ID no apunta a una carpeta");
    }
    return {
      id: folder.id,
      name: folder.name || TECHNICAL_SHEETS_FOLDER,
      url: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
    };
  }
  const query = [
    `'${driveQuery(config.folderId)}' in parents`,
    `name = '${driveQuery(TECHNICAL_SHEETS_FOLDER)}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    "trashed = false",
  ].join(" and ");
  const listResponse = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&spaces=drive&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,webViewLink)&pageSize=10`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!listResponse.ok) throw new Error(await driveError(listResponse));
  const listed = (await listResponse.json()) as {
    files?: Array<{ id: string; name: string; webViewLink?: string }>;
  };
  const existing = listed.files?.[0];
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      url: existing.webViewLink || `https://drive.google.com/drive/folders/${existing.id}`,
    };
  }

  const createResponse = await fetch(
    `${DRIVE_API}/files?supportsAllDrives=true&fields=id,name,webViewLink`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: TECHNICAL_SHEETS_FOLDER,
        mimeType: "application/vnd.google-apps.folder",
        parents: [config.folderId],
      }),
      cache: "no-store",
    },
  );
  if (!createResponse.ok) throw new Error(await driveError(createResponse));
  const created = (await createResponse.json()) as {
    id?: string;
    name?: string;
    webViewLink?: string;
  };
  if (!created.id) throw new Error("Google Drive no devolvió la carpeta de fichas técnicas");
  return {
    id: created.id,
    name: created.name || TECHNICAL_SHEETS_FOLDER,
    url: created.webViewLink || `https://drive.google.com/drive/folders/${created.id}`,
  };
}

export async function listDriveTechnicalSheets(): Promise<{
  folder: { id: string; name: string; url: string };
  files: DriveTechnicalSheet[];
}> {
  const folder = await ensureTechnicalSheetsDriveFolder();
  const token = await accessToken();
  const files: DriveTechnicalSheet[] = [];
  let pageToken: string | undefined;
  do {
    const query = [
      `'${driveQuery(folder.id)}' in parents`,
      `mimeType = 'application/pdf'`,
      "trashed = false",
    ].join(" and ");
    const params = new URLSearchParams({
      q: query,
      spaces: "drive",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum,size,webViewLink)",
      orderBy: "name",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(await driveError(response));
    const body = (await response.json()) as {
      nextPageToken?: string;
      files?: Array<{
        id?: string;
        name?: string;
        mimeType?: string;
        modifiedTime?: string;
        md5Checksum?: string;
        size?: string;
        webViewLink?: string;
      }>;
    };
    for (const file of body.files ?? []) {
      if (!file.id || !file.name || !file.modifiedTime) continue;
      files.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType || "application/pdf",
        modifiedTime: file.modifiedTime,
        md5Checksum: file.md5Checksum || null,
        size: file.size ? Number(file.size) : null,
        webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
      });
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return { folder, files };
}

export async function downloadDriveTechnicalSheet(fileId: string): Promise<Buffer> {
  const token = await accessToken();
  const response = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!response.ok) throw new Error(await driveError(response));
  return Buffer.from(await response.arrayBuffer());
}

export async function uploadDriveTechnicalSheet(input: {
  name: string;
  content: Buffer;
}): Promise<DriveTechnicalSheet> {
  const folder = await ensureTechnicalSheetsDriveFolder();
  const token = await accessToken();
  const boundary = `teravino_sheet_${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name: input.name, parents: [folder.id] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
    input.content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const response = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,md5Checksum,size,webViewLink`,
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
  const file = (await response.json()) as {
    id?: string;
    name?: string;
    mimeType?: string;
    modifiedTime?: string;
    md5Checksum?: string;
    size?: string;
    webViewLink?: string;
  };
  if (!file.id || !file.name || !file.modifiedTime) {
    throw new Error("Google Drive no devolvió los datos del PDF");
  }
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType || "application/pdf",
    modifiedTime: file.modifiedTime,
    md5Checksum: file.md5Checksum || null,
    size: file.size ? Number(file.size) : null,
    webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
  };
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
