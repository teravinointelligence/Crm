create or replace function public.next_request_number()
returns text language plpgsql as $$
declare v_year text; v_next int;
begin
  v_year := to_char(current_date, 'YYYY');
  select coalesce(max(substring(request_number from '\d+$')::int), 0) + 1
    into v_next
    from public.restock_requests
   where request_number like 'REQ-' || v_year || '-%';
  return 'REQ-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$$;
