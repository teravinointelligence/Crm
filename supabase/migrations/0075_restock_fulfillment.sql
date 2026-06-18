-- Tipo de surtido en los pedidos de restock: desde el almacén (Los Cabos) o
-- directo del proveedor a la plaza del vendedor (Vernazza, Brewwines, Vinaltura…),
-- sin pasar por Los Cabos.

alter table restock_requests
  add column if not exists fulfillment text not null default 'almacen';

alter table restock_requests
  drop constraint if exists restock_requests_fulfillment_chk;
alter table restock_requests
  add constraint restock_requests_fulfillment_chk
  check (fulfillment in ('almacen', 'directo_proveedor'));

comment on column restock_requests.fulfillment is
  'almacen = surtir desde almacén (Los Cabos); directo_proveedor = pedido directo al proveedor a la plaza del vendedor.';
