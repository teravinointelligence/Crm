-- HubSpot sync support: stable external IDs + billing email
alter table public.accounts add column if not exists hubspot_company_id bigint unique;
alter table public.contacts add column if not exists hubspot_contact_id bigint unique;
alter table public.accounts add column if not exists billing_email text;
create index if not exists idx_accounts_hubspot on public.accounts(hubspot_company_id);
create index if not exists idx_contacts_hubspot on public.contacts(hubspot_contact_id);
