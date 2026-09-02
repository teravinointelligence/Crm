-- La importación automática y la carga manual pueden recibir el mismo CFDI al
-- mismo tiempo. La base de datos es la última barrera contra pedidos duplicados.
create unique index if not exists reparto_pedidos_uuid_fiscal_uidx
  on reparto.pedidos (upper(btrim(uuid_fiscal)))
  where uuid_fiscal is not null and btrim(uuid_fiscal) <> '';
