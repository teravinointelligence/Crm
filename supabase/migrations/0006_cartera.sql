-- =====================================================================
-- Cartera de clientes — RLS para reps + helpers de pagos
-- =====================================================================

-- Reps pueden escribir facturas/pagos de sus propias cuentas (admin: total)
drop policy if exists invoices_admin_write on public.invoices;
drop policy if exists invoices_write on public.invoices;
create policy invoices_write on public.invoices
  for all using (
    public.is_admin() or exists (
      select 1 from public.accounts a
      where a.id = invoices.account_id and a.assigned_rep_id = public.current_rep_id()
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.accounts a
      where a.id = invoices.account_id and a.assigned_rep_id = public.current_rep_id()
    )
  );

drop policy if exists payments_admin_write on public.payments;
drop policy if exists payments_write on public.payments;
create policy payments_write on public.payments
  for all using (
    public.is_admin() or exists (
      select 1 from public.accounts a
      where a.id = payments.account_id and a.assigned_rep_id = public.current_rep_id()
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.accounts a
      where a.id = payments.account_id and a.assigned_rep_id = public.current_rep_id()
    )
  );

create or replace function public.next_invoice_number()
returns text language plpgsql set search_path = public as $$
declare v_year text; v_next int;
begin
  v_year := to_char(current_date, 'YYYY');
  select coalesce(max(substring(invoice_number from '\d+$')::int), 0) + 1 into v_next
    from public.invoices where invoice_number like 'FAC-' || v_year || '-%';
  return 'FAC-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$$;

create or replace function public.refresh_invoice_status(p_invoice_id uuid)
returns void language plpgsql set search_path = public as $$
declare v invoices%rowtype;
begin
  select * into v from public.invoices where id = p_invoice_id;
  if not found then return; end if;
  if v.status = 'cancelada' then return; end if;
  update public.invoices set status = case
    when v.balance <= 0 then 'pagada'
    when v.total_paid > 0 and v.balance > 0 and v.due_date is not null and v.due_date < current_date then 'vencida'
    when v.total_paid > 0 then 'pagada_parcial'
    when v.due_date is not null and v.due_date < current_date then 'vencida'
    else 'pendiente'
  end where id = p_invoice_id;
end;
$$;

-- Aplica un pago: inserta el registro y reparte sobre facturas (FIFO por due_date) o sobre una factura específica
create or replace function public.apply_payment(
  p_account_id uuid, p_amount numeric, p_payment_date date, p_method text,
  p_reference text, p_notes text, p_invoice_id uuid default null
) returns uuid language plpgsql set search_path = public as $$
declare v_payment_id uuid; v_remaining numeric := p_amount; v_inv record; v_apply numeric;
begin
  insert into public.payments (invoice_id, account_id, payment_date, amount, method, reference, notes)
    values (p_invoice_id, p_account_id, p_payment_date, p_amount, p_method, p_reference, p_notes)
    returning id into v_payment_id;
  if p_invoice_id is not null then
    update public.invoices set total_paid = coalesce(total_paid,0) + p_amount where id = p_invoice_id;
    perform public.refresh_invoice_status(p_invoice_id);
  else
    for v_inv in
      select id, balance from public.invoices
      where account_id = p_account_id and status <> 'cancelada' and balance > 0
      order by due_date nulls last, invoice_date
    loop
      exit when v_remaining <= 0;
      v_apply := least(v_remaining, v_inv.balance);
      update public.invoices set total_paid = coalesce(total_paid,0) + v_apply where id = v_inv.id;
      perform public.refresh_invoice_status(v_inv.id);
      v_remaining := v_remaining - v_apply;
    end loop;
  end if;
  return v_payment_id;
end;
$$;
