-- Ajustes derivados de los advisors: las funciones de trigger no deben ser
-- RPC públicas y cada llave foránea nueva queda cubierta por un índice.

revoke execute on function public.tg_sample_conversion_from_bank() from public, anon, authenticated;
revoke execute on function public.tg_sample_conversion_from_direct() from public, anon, authenticated;

create index if not exists idx_sample_conversion_product
  on public.sample_conversion_events(product_id);
create index if not exists idx_sample_conversion_updated_by
  on public.sample_conversion_events(updated_by);
create index if not exists idx_sample_conversion_settings_updated_by
  on public.sample_conversion_settings(updated_by);
