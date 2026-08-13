// Acceso de solo lectura a Google Drive con una cuenta de servicio, para bajar
// los reportes de inventario de CONTPAQ sin intervención humana.
//
// Se firma un JWT con la llave de la cuenta de servicio y se cambia por un
// access_token (flujo "JWT bearer" de Google). Se hace a mano con node:crypto
// para no meter la librería `googleapis` (pesada) al bundle de Vercel.
//
// Variables de entorno:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL   algo@algo.iam.gserviceaccount.com
//   GOOGLE_SERVICE_ACCOUNT_KEY     la private_key del JSON (con \n escapados o reales)
//   INVENTARIO_DRIVE_FOLDER_ID     carpeta de Drive donde caen los .xls
//
// OJO: una cuenta de servicio solo ve lo que se le comparte. La carpeta de
// Drive tiene que estar compartida con GOOGLE_SERVICE_ACCOUNT_EMAIL (permiso de
// lectura basta).

import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export type DriveFile = {
  id: string;
  name: string;
  modifiedTime: string;
  mimeType: string;
  size?: string;
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function serviceAccount(): { email: string; key: string } {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // En Vercel la llave se pega en una sola línea con \n escapados.
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error(
      "Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_SERVICE_ACCOUNT_KEY en el entorno " +
        "(Vercel → Settings → Environment Variables).",
    );
  }
  return { email, key };
}

let cached: { token: string; expiresAt: number } | null = null;

export async function getDriveAccessToken(): Promise<string> {
  // El token dura una hora; se reusa mientras le queden 60 s de vida.
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;

  const { email, key } = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = base64url(signer.sign(key));
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = (await res.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number; error?: string; error_description?: string }
    | null;
  if (!res.ok || !body?.access_token) {
    throw new Error(
      `Google no dio el token (${res.status}): ${body?.error_description ?? body?.error ?? "sin detalle"}`,
    );
  }

  cached = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}

// Reportes de inventario en la carpeta, modificados en los últimos `sinceDays`
// días, del más reciente al más viejo.
export async function listInventarioFiles(opts: {
  folderId: string;
  sinceDays: number;
}): Promise<DriveFile[]> {
  const token = await getDriveAccessToken();
  const since = new Date(Date.now() - opts.sinceDays * 86_400_000).toISOString();
  const q = [
    `'${opts.folderId}' in parents`,
    "trashed = false",
    "name contains 'inventario'",
    `modifiedTime > '${since}'`,
  ].join(" and ");

  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", q);
  url.searchParams.set("orderBy", "modifiedTime desc");
  url.searchParams.set("pageSize", "50");
  url.searchParams.set("fields", "files(id,name,modifiedTime,mimeType,size)");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Drive no listó la carpeta (${res.status}): ${detail.slice(0, 300)}`);
  }
  const body = (await res.json()) as { files?: DriveFile[] };
  return body.files ?? [];
}

export async function downloadDriveFile(fileId: string): Promise<ArrayBuffer> {
  const token = await getDriveAccessToken();
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Drive no bajó el archivo (${res.status}): ${detail.slice(0, 300)}`);
  }
  return res.arrayBuffer();
}
