-- =====================================================================
-- SEED — TERAVINO CRM
-- =====================================================================
-- Vendedores (sin auth_user_id; se enlaza después al crear usuarios en auth.users)
insert into public.sales_reps (id, email, full_name, primary_region, role) values
  ('00000000-0000-4000-a000-000000000001','yamile@teravino.com','Yamile','Los Cabos','rep'),
  ('00000000-0000-4000-a000-000000000002','citlali@teravino.com','Citlali Aguilar','La Paz','rep'),
  ('00000000-0000-4000-a000-000000000003','andra@teravino.com','Andra Verea','Puerto Vallarta','rep'),
  ('00000000-0000-4000-a000-000000000004','emmanuel@teravino.com','Emmanuel','Tijuana','rep'),
  ('00000000-0000-4000-a000-000000000005','felix@teravino.com','Felix','Nayarit','rep'),
  ('00000000-0000-4000-a000-000000000099','sabrina@teravino.com','Sabrina Sánchez',null,'admin')
on conflict (email) do nothing;

-- Cuentas demo (una por región principal)
insert into public.accounts
  (id, business_name, account_type, region, city, price_tier, assigned_rep_id, status, notes) values
  ('00000000-0000-4000-b000-000000000001','Hotel Esperanza Los Cabos','hotel','Los Cabos','San José del Cabo','base',
   '00000000-0000-4000-a000-000000000001','activo','Cuenta ancla — wine list curada por sommelier'),
  ('00000000-0000-4000-b000-000000000002','Casa Lupita La Paz','restaurante','La Paz','La Paz','+10',
   '00000000-0000-4000-a000-000000000002','activo','Precio +10 por logística BCS Sur'),
  ('00000000-0000-4000-b000-000000000003','Hotelito Todos Santos','hotel','Todos Santos','Todos Santos','base',
   '00000000-0000-4000-a000-000000000001','prospecto',null),
  ('00000000-0000-4000-b000-000000000004','Cervecería Tijuana Norte','bar','Tijuana','Tijuana','+10',
   '00000000-0000-4000-a000-000000000004','activo','Pedido recurrente cada 2 semanas'),
  ('00000000-0000-4000-b000-000000000005','La Leche PV','restaurante','Puerto Vallarta','Puerto Vallarta','base',
   '00000000-0000-4000-a000-000000000003','activo','F&B exigente, lista de vinos cambia trimestralmente')
on conflict (id) do nothing;

-- Contactos demo
insert into public.contacts (account_id, full_name, role, email, phone, whatsapp, is_primary) values
  ('00000000-0000-4000-b000-000000000001','María González','Sommelier','maria@hotelesperanza.com','+526241234567','526241234567',true),
  ('00000000-0000-4000-b000-000000000001','Luis Ramírez','F&B Manager','luis@hotelesperanza.com','+526249876543','526249876543',false),
  ('00000000-0000-4000-b000-000000000002','Ana Castro','Gerente','ana@casalupita.mx','+526121112233','526121112233',true),
  ('00000000-0000-4000-b000-000000000004','Carlos Mendoza','Compras','carlos@ctn.mx','+526641234567','526641234567',true);

-- Productos demo (15 SKUs, cubriendo los 11 proveedores)
insert into public.products
  (sku, name, supplier, category, varietal, country, region_origin, vintage,
   volume_ml, base_price, stock_quantity, stock_min_alert, active) values
  ('VRN-001','Vernazza Nebbiolo Reserva','Vernazza','vino_tinto','Nebbiolo','Italia','Piamonte','2019',750,890.00,24,6,true),
  ('VRN-002','Vernazza Barbera Classico','Vernazza','vino_tinto','Barbera','Italia','Piamonte','2021',750,620.00,36,6,true),
  ('BRM-001','Bruma Atrevida Tinto','Bruma','vino_tinto','Cabernet Sauvignon','México','Valle de Guadalupe','2020',750,720.00,18,6,true),
  ('BRM-002','Bruma Blanco de Notas','Bruma','vino_blanco','Chenin Blanc','México','Valle de Guadalupe','2022',750,650.00,12,6,true),
  ('VNA-001','Vinaltura Cumbre','Vinaltura','vino_tinto','Tempranillo','España','Rioja','2019',750,780.00,30,6,true),
  ('BRW-001','Brewwines IPA Edición Limitada','Brewwines','cerveza',null,'México','Tijuana','NV',355,95.00,120,24,true),
  ('LCH-001','Lechuza Chardonnay Reserva','Lechuza','vino_blanco','Chardonnay','México','Valle de Guadalupe','2021',750,840.00,15,6,true),
  ('WDL-001','Wendlandt Harry Polanco','Wendlandt','cerveza',null,'México','Ensenada','NV',355,85.00,144,24,true),
  ('DVN-001','Discográfica Fluxus Naranja','Discográfica Vinícola','vino_naranja','Chenin Blanc','México','Valle de Guadalupe','2022',750,690.00,6,8,true),
  ('FLC-001','Finca La Carrodilla Canto de Luna','Finca La Carrodilla','vino_tinto','Tempranillo','México','Valle de Guadalupe','2020',750,710.00,9,6,true),
  ('PHL-001','Philipponnat Royale Réserve Brut','Philipponnat','espumoso','Pinot Noir','Francia','Champagne','NV',750,2150.00,8,4,true),
  ('HBL-001','Habla del Silencio','Habla','vino_tinto','Tempranillo','España','Extremadura','2020',750,560.00,42,12,true),
  ('LCM-001','La Crema Sonoma Coast Pinot Noir','La Crema','vino_tinto','Pinot Noir','Estados Unidos','Sonoma','2021',750,980.00,12,6,true),
  ('LCM-002','La Crema Chardonnay Monterey','La Crema','vino_blanco','Chardonnay','Estados Unidos','Monterey','2022',750,920.00,10,6,true),
  ('VRN-003','Vernazza Moscato Spumante','Vernazza','espumoso','Moscato','Italia','Asti','NV',750,540.00,4,6,true)
on conflict (sku) do nothing;

-- Actividades demo (para alimentar el dashboard)
insert into public.activities
  (account_id, sales_rep_id, activity_type, activity_date, outcome, next_step, next_step_date, notes) values
  ('00000000-0000-4000-b000-000000000001','00000000-0000-4000-a000-000000000001',
   'visita', now() - interval '2 days',
   'Presenté la nueva colección italiana de Vernazza. Sommelier interesada en Nebbiolo Reserva.',
   'Enviar cotización por 12 botellas Nebbiolo Reserva', current_date + 2,
   'Cliente quiere muestra para cata interna'),
  ('00000000-0000-4000-b000-000000000005','00000000-0000-4000-a000-000000000003',
   'degustacion', now() - interval '5 days',
   'Cata con chef y sommelier. Les encantó La Crema Chardonnay.',
   'Cerrar pedido de 24 botellas La Crema Chardonnay', current_date + 5, null),
  ('00000000-0000-4000-b000-000000000004','00000000-0000-4000-a000-000000000004',
   'llamada', now() - interval '1 day',
   'Pedido recurrente confirmado',
   'Generar pedido formal', current_date + 1, null);
