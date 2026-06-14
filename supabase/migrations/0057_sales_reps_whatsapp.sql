-- WhatsApp por vendedor, para incluirlo como contacto del vendedor asignado en
-- los correos al cliente (envío de portafolios). Opcional: si está vacío, el
-- correo usa solo el WhatsApp oficial de TERAVINO.
alter table public.sales_reps add column if not exists whatsapp text;
