-- Permite registrar visitas de cobranza como actividades calificadas del CRM.
-- Se mantienen separadas de las visitas comerciales para no distorsionar la
-- métrica de conversión visita -> pedido.

alter table public.activities
  drop constraint if exists activities_activity_type_check;

alter table public.activities
  add constraint activities_activity_type_check
  check (activity_type in (
    'visita',
    'visita_cobranza',
    'llamada',
    'email',
    'whatsapp',
    'degustacion',
    'reunion',
    'evento'
  ));

comment on column public.activities.activity_type is
  'Tipo de actividad; visita_cobranza registra gestiones presenciales de cobro.';
