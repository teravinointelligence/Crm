import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20260902140945_activity_follow_up_comments.sql",
  import.meta.url,
);
const authorIndexMigrationUrl = new URL(
  "../supabase/migrations/20260902141439_activity_comments_author_index.sql",
  import.meta.url,
);
const sql = `${await readFile(migrationUrl, "utf8")} ${await readFile(authorIndexMigrationUrl, "utf8")}`
  .replace(/--.*$/gm, "")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

test("los comentarios tienen historial, límite e índice por actividad", () => {
  assert.match(sql, /create table public\.activity_comments/);
  assert.match(sql, /references public\.activities\(id\) on delete cascade/);
  assert.match(sql, /references public\.sales_reps\(id\) on delete restrict/);
  assert.match(sql, /char_length\(btrim\(body\)\) between 1 and 2000/);
  assert.match(sql, /activity_comments \(activity_id, created_at\)/);
  assert.match(sql, /activity_comments \(author_rep_id\)/);
});

test("RLS limita lectura y alta a la actividad relacionada", () => {
  assert.match(sql, /alter table public\.activity_comments enable row level security/);
  assert.match(sql, /create policy activity_comments_select/);
  assert.match(sql, /create policy activity_comments_insert/);
  assert.match(sql, /activity\.sales_rep_id = \(select public\.current_rep_id\(\)\)/);
  assert.match(sql, /account\.assigned_rep_id = \(select public\.current_rep_id\(\)\)/);
  assert.match(sql, /\(select public\.is_admin\(\)\)/);
});

test("una sesión autenticada no puede suplantar autor, editar ni borrar", () => {
  assert.match(
    sql,
    /author_rep_id = \(select public\.current_rep_id\(\)\)/,
  );
  assert.match(
    sql,
    /grant select, insert on table public\.activity_comments to authenticated/,
  );
  assert.doesNotMatch(
    sql,
    /grant[^;]*(update|delete)[^;]*to authenticated/,
  );
  assert.doesNotMatch(
    sql,
    /create policy activity_comments_(update|delete)/,
  );
});
