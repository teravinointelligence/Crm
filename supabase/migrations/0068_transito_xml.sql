-- Agrega columna para el XML (CFDI) de la factura del proveedor en OCs.
alter table public.purchase_orders
  add column if not exists supplier_invoice_xml_url text;
