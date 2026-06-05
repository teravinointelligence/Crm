-- Capacitaciones: cuando una solicitud de muestra es para una capacitación, se
-- indica para cuántas personas. Regla operativa: 1 botella de 750 ml alcanza
-- para 8 tastings, así que las botellas por vino = ceil(personas / 8)
-- (se calculan y autocompletan en el formulario).
alter table public.sample_requests add column if not exists training_people int;

alter table public.sample_requests drop constraint if exists sample_requests_training_people_chk;
alter table public.sample_requests
  add constraint sample_requests_training_people_chk
  check (training_people is null or training_people > 0);
