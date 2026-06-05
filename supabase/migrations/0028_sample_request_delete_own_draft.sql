-- Permite borrar solicitudes de muestra: el vendedor puede borrar SUS borradores
-- (admin puede borrar cualquiera). Habilita limpiar el borrador a medias cuando
-- el envío falla, para no dejar solicitudes huérfanas.
drop policy if exists sample_requests_delete on public.sample_requests;
create policy sample_requests_delete on public.sample_requests
  for delete using (
    public.is_admin()
    or (sales_rep_id = public.current_rep_id() and status = 'borrador')
  );
