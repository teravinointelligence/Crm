// Migración one-off: consolida el proyecto Supabase "teravino-reparto" (origen)
// dentro de la BD del CRM "teravino-crm", esquema `reparto` (destino).
//
// Es IDEMPOTENTE: preserva los UUID y hace upsert por id; el auth se reusa por
// email. Se puede re-ejecutar sin duplicar.
//
// Uso:
//   node --env-file=.env.local scripts/migrate-reparto.mjs
//
// Requiere en el entorno:
//   NEXT_PUBLIC_SUPABASE_URL              (CRM, destino)
//   SUPABASE_SERVICE_ROLE_KEY             (CRM, destino — service_role)
//   NEXT_PUBLIC_REPARTO_SUPABASE_URL      (reparto, origen)
//   REPARTO_SUPABASE_SERVICE_ROLE_KEY     (reparto, origen — service_role)

import { createClient } from "@supabase/supabase-js";

const SRC_URL = process.env.NEXT_PUBLIC_REPARTO_SUPABASE_URL;
const SRC_KEY = process.env.REPARTO_SUPABASE_SERVICE_ROLE_KEY;
const DST_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const DST_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

for (const [k, v] of Object.entries({
  NEXT_PUBLIC_REPARTO_SUPABASE_URL: SRC_URL,
  REPARTO_SUPABASE_SERVICE_ROLE_KEY: SRC_KEY,
  NEXT_PUBLIC_SUPABASE_URL: DST_URL,
  SUPABASE_SERVICE_ROLE_KEY: DST_KEY,
})) {
  if (!v) {
    console.error(`✗ Falta la variable de entorno ${k}. Agrégala a .env.local.`);
    process.exit(1);
  }
}

const authOpts = { auth: { persistSession: false, autoRefreshToken: false } };
// Origen: datos en public.
const src = createClient(SRC_URL, SRC_KEY, { ...authOpts });
// Destino: datos en el esquema reparto.
const dst = createClient(DST_URL, DST_KEY, { ...authOpts, db: { schema: "reparto" } });
// Destino: cliente auth/storage (schema default, irrelevante para auth/storage).
const dstRoot = createClient(DST_URL, DST_KEY, { ...authOpts });

const log = (...a) => console.log(...a);
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

function randomPassword(n = 14) {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789@#$%";
  let out = "";
  for (let i = 0; i < n; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

// Lee TODAS las filas de una tabla del origen (paginando, PostgREST limita a 1000).
async function fetchAll(table) {
  const rows = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await src.from(table).select("*").order("id", { ascending: true }).range(from, from + page - 1);
    if (error) throw new Error(`Leyendo ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < page) break;
  }
  return rows;
}

async function upsertAll(table, rows) {
  if (!rows.length) return;
  for (const part of chunk(rows, 500)) {
    const { error } = await dst.from(table).upsert(part, { onConflict: "id" });
    if (error) throw new Error(`Upsert ${table}: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// 1) AUTH: recrear/reusar cuentas en el CRM, mapeando oldAuthId -> newCrmAuthId.
// ---------------------------------------------------------------------------
async function listAllAuthUsers(client) {
  const all = [];
  for (let pageNum = 1; ; pageNum++) {
    const { data, error } = await client.auth.admin.listUsers({ page: pageNum, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    all.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return all;
}

async function migrateAuth(usuarios) {
  log("\n== Auth ==");
  const dstUsers = await listAllAuthUsers(dstRoot);
  const dstByEmail = new Map(dstUsers.filter((u) => u.email).map((u) => [u.email.toLowerCase(), u.id]));

  const map = new Map(); // oldAuthId -> newCrmAuthId
  const created = []; // {email, password}
  for (const u of usuarios) {
    if (!u.auth_id || !u.email) continue;
    const email = u.email.toLowerCase();
    const existing = dstByEmail.get(email);
    if (existing) {
      map.set(u.auth_id, existing);
      log(`  • ${email}: reusa cuenta CRM existente`);
      continue;
    }
    const password = randomPassword();
    const { data, error } = await dstRoot.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre: u.nombre },
    });
    if (error) {
      const msg = (error.message ?? "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered")) {
        // Race / no estaba en el listado: re-listar y mapear.
        const again = (await listAllAuthUsers(dstRoot)).find((x) => x.email?.toLowerCase() === email);
        if (again) {
          map.set(u.auth_id, again.id);
          dstByEmail.set(email, again.id);
          log(`  • ${email}: ya existía, reusada`);
          continue;
        }
      }
      throw new Error(`createUser ${email}: ${error.message}`);
    }
    map.set(u.auth_id, data.user.id);
    dstByEmail.set(email, data.user.id);
    created.push({ email, password });
    log(`  ✚ ${email}: cuenta NUEVA creada`);
  }

  if (created.length) {
    log("\n  ⚠ Contraseñas temporales (repartir y pedir cambio):");
    for (const c of created) log(`     ${c.email}  ->  ${c.password}`);
  } else {
    log("  (sin cuentas nuevas; todas reusadas)");
  }
  return map;
}

// ---------------------------------------------------------------------------
// 2) STORAGE: copia el único objeto (foto de entrega) y devuelve mapa url->url.
// ---------------------------------------------------------------------------
function parseStorageUrl(url) {
  // .../storage/v1/object/(public|sign|authenticated)/<bucket>/<path...>
  const m = url.match(/\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/]+)\/(.+?)(?:\?|$)/);
  if (!m) return null;
  return { bucket: m[1], path: m[2] };
}

async function copyStorageObject(url) {
  const parsed = parseStorageUrl(url);
  if (!parsed) {
    log(`  ! No pude parsear la URL de storage: ${url}`);
    return url;
  }
  const { bucket, path } = parsed;
  const { data: blob, error: dlErr } = await src.storage.from(bucket).download(path);
  if (dlErr) {
    log(`  ! No pude descargar ${bucket}/${path}: ${dlErr.message}`);
    return url;
  }
  const buf = Buffer.from(await blob.arrayBuffer());
  const { error: upErr } = await dstRoot.storage
    .from(bucket)
    .upload(path, buf, { upsert: true, contentType: blob.type || "image/jpeg" });
  if (upErr) {
    log(`  ! No pude subir ${bucket}/${path}: ${upErr.message}`);
    return url;
  }
  const { data: pub } = dstRoot.storage.from(bucket).getPublicUrl(path);
  log(`  ✓ Copiado ${bucket}/${path}`);
  return pub.publicUrl;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  log("Leyendo origen…");
  const [clientes, usuarios, pedidos, productos, entregas] = await Promise.all([
    fetchAll("clientes"),
    fetchAll("usuarios"),
    fetchAll("pedidos"),
    fetchAll("pedido_productos"),
    fetchAll("entregas"),
  ]);
  log(`  clientes=${clientes.length} usuarios=${usuarios.length} pedidos=${pedidos.length} productos=${productos.length} entregas=${entregas.length}`);

  const authMap = await migrateAuth(usuarios);

  log("\n== Datos ==");
  await upsertAll("clientes", clientes);
  log(`  ✓ clientes (${clientes.length})`);

  const usuariosRemap = usuarios.map((u) => ({ ...u, auth_id: u.auth_id ? authMap.get(u.auth_id) ?? null : null }));
  await upsertAll("usuarios", usuariosRemap);
  log(`  ✓ usuarios (${usuarios.length}) — auth_id remapeado`);

  await upsertAll("pedidos", pedidos);
  log(`  ✓ pedidos (${pedidos.length})`);

  await upsertAll("pedido_productos", productos);
  log(`  ✓ pedido_productos (${productos.length})`);

  log("\n== Storage + entregas ==");
  const entregasRemap = [];
  for (const e of entregas) {
    let foto = e.foto_url;
    if (foto) foto = await copyStorageObject(foto);
    entregasRemap.push({ ...e, foto_url: foto });
  }
  await upsertAll("entregas", entregasRemap);
  log(`  ✓ entregas (${entregas.length})`);

  // Verificación de conteos en destino.
  log("\n== Verificación (conteos destino) ==");
  for (const t of ["clientes", "usuarios", "pedidos", "pedido_productos", "entregas"]) {
    const { count, error } = await dst.from(t).select("id", { count: "exact", head: true });
    log(`  reparto.${t}: ${error ? "ERROR " + error.message : count}`);
  }
  log("\n✅ Migración completa.");
}

main().catch((e) => {
  console.error("\n✗ Error:", e.message);
  process.exit(1);
});
