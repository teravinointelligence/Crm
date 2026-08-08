// Acceso de solo lectura a Google Drive con una cuenta de servicio.
// SERVER-ONLY. Sin dependencias nuevas: firma el JWT con node:crypto y habla
// con la API por fetch, para no meter `googleapis` (~40 MB) al bundle.
//
// Configuración (Vercel → Settings → Environment Variables):
//   GOOGLE_SA_EMAIL        correo de la cuenta de servicio
//   GOOGLE_SA_PRIVATE_KEY  private_key del JSON (con los \n escapados)
//
// La carpeta de Drive debe estar COMPARTIDA con GOOGLE_SA_EMAIL como Lector.

import "server-only";
import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

let cached: { token: string; expiresAt: number } | null = null;

function b64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function privateKey(): string {
  const raw = process.env.GOOGLE_SA_PRIVATE_KEY;
  if (!raw) {
    throw new Error(
      "Falta GOOGLE_SA_PRIVATE_KEY en el entorno. Se necesita para leer los " +
        "inventarios de Google Drive.",
    );
  }
  // En Vercel la llave se pega en una sola línea con \n escapados.
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

// Token OAuth2 de la cuenta de servicio. Se cachea en memoria hasta un minuto
// antes de expirar; en un cron que corre una vez al día casi siempre se pide
// uno nuevo, pero evita 5 round-trips dentro de la misma ejecución.
async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt > now + 60) return cached.token;

  const email = process.env.GOOGLE_SA_EMAIL;
  if (!email) {
    throw new Error("Falta GOOGLE_SA_EMAIL en el entorno.");
  }

  const unsigned =
    b64url({ alg: "RS256", typ: "JWT" }) +
    "." +
    b64url({
      iss: email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    });

  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(privateKey(), "base64url");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Google rechazó las credenciales de la cuenta de servicio (${res.status}): ${await res.text()}`,
    );
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expiresAt: now + json.expires_in };
  return json.access_token;
}

export type DriveListItem = {
  id: string;
  name: string;
  modifiedTime: string;
};

// Lista los archivos de una carpeta (sin subcarpetas, sin papelera).
export async function listFolder(folderId: string): Promise<DriveListItem[]> {
  const token = await accessToken();
  const items: DriveListItem[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, modifiedTime)",
      pageSize: "200",
      orderBy: "modifiedTime desc",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(
        `No pude listar la carpeta de Drive (${res.status}): ${await res.text()}. ` +
          "Revisa que la carpeta esté compartida con la cuenta de servicio.",
      );
    }

    const json = (await res.json()) as {
      files?: DriveListItem[];
      nextPageToken?: string;
    };
    items.push(...(json.files ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);

  return items;
}

// Descarga el contenido binario de un archivo (no sirve para Google Docs
// nativos, que requerirían export; los inventarios son .xls/.xlsx subidos).
export async function downloadFile(fileId: string): Promise<ArrayBuffer> {
  const token = await accessToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(
      `No pude descargar el archivo ${fileId} de Drive (${res.status}): ${await res.text()}`,
    );
  }
  return res.arrayBuffer();
}
