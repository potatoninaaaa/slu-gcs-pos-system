-- =====================================================================
-- SLU GCS POS: initial schema
-- =====================================================================

-- ---------- Helper: updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Profiles (roles) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'cashier' check (role in ('admin','cashier')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Role helpers (SECURITY DEFINER so RLS policies can call them safely)
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and active and role = 'admin');
$$;

-- Auto-create a profile (as cashier) for every new auth user
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, split_part(new.email, '@', 1), 'cashier')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill profiles for accounts you already created
insert into public.profiles (id, email, full_name, role)
select id, email, split_part(email, '@', 1), 'cashier' from auth.users
on conflict (id) do nothing;

-- ---------- Categories ----------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index categories_name_uk on public.categories (lower(name));
create trigger categories_updated_at before update on public.categories
for each row execute function public.set_updated_at();

-- ---------- Products ----------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null check (length(trim(sku)) > 0),
  name text not null check (length(trim(name)) > 0),
  description text,
  category_id uuid references public.categories(id) on delete restrict,
  price numeric(12,2) not null check (price >= 0),
  stock_qty integer not null default 0 check (stock_qty >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  is_available boolean not null default true,
  is_archived boolean not null default false,
  image_path text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_sku_uk on public.products (lower(sku));
create index products_category_idx on public.products (category_id);
create index products_name_idx on public.products (lower(name));
create index products_archived_idx on public.products (is_archived);
create trigger products_updated_at before update on public.products
for each row execute function public.set_updated_at();

-- Stock may ONLY change through process_sale() or adjust_stock()
create or replace function public.guard_stock_change()
returns trigger language plpgsql as $$
begin
  if new.stock_qty is distinct from old.stock_qty
     and coalesce(current_setting('app.allow_stock_change', true), 'off') <> 'on' then
    raise exception 'Stock can only be changed through adjust_stock() or process_sale()';
  end if;
  return new;
end $$;

create trigger products_guard_stock before update on public.products
for each row execute function public.guard_stock_change();

-- ---------- Inventory movements ----------
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in
    ('initial','sale','restock','deduction','adjustment')),
  quantity_change integer not null,
  stock_before integer not null check (stock_before >= 0),
  stock_after integer not null check (stock_after >= 0),
  reason text,
  transaction_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index movements_product_idx on public.inventory_movements (product_id, created_at desc);
create index movements_created_idx on public.inventory_movements (created_at desc);
create index movements_txn_idx on public.inventory_movements (transaction_id);

-- Log initial stock when a product is created (SECURITY DEFINER: clients cannot insert movements)
create or replace function public.log_initial_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stock_qty > 0 then
    insert into public.inventory_movements
      (product_id, movement_type, quantity_change, stock_before, stock_after, reason, created_by)
    values (new.id, 'initial', new.stock_qty, 0, new.stock_qty, 'Initial stock', auth.uid());
  end if;
  return new;
end $$;

create trigger products_initial_stock after insert on public.products
for each row execute function public.log_initial_stock();

-- ---------- Transactions ----------
-- id is generated ON THE DEVICE (uuid) so offline sales are idempotent on sync.
create table public.transactions (
  id uuid primary key,
  receipt_no text not null unique,
  cashier_id uuid references auth.users(id),
  status text not null check (status in ('completed','cancelled')),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  cash_received numeric(12,2) not null default 0 check (cash_received >= 0),
  change_given numeric(12,2) not null default 0 check (change_given >= 0),
  created_at timestamptz not null,          -- time of sale on the device
  synced_at timestamptz not null default now(),
  constraint paid_in_full check (status <> 'completed' or cash_received >= total_amount)
);
create index transactions_created_idx on public.transactions (created_at desc);
create index transactions_status_idx on public.transactions (status);
create index transactions_cashier_idx on public.transactions (cashier_id);

create table public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,   -- snapshots, so history stays accurate if a product is edited
  sku text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);
create index titems_txn_idx on public.transaction_items (transaction_id);
create index titems_product_idx on public.transaction_items (product_id);

-- ---------- Activity logs ----------
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index logs_created_idx on public.activity_logs (created_at desc);
create index logs_entity_idx on public.activity_logs (entity_type, entity_id);
create index logs_action_idx on public.activity_logs (action);

-- ---------- App settings ----------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create trigger settings_updated_at before update on public.app_settings
for each row execute function public.set_updated_at();

-- =====================================================================
-- Atomic, idempotent sale processing
-- =====================================================================
create or replace function public.process_sale(
  p_id uuid,
  p_receipt_no text,
  p_created_at timestamptz,
  p_status text,
  p_cash_received numeric,
  p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_total numeric(12,2);
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
  v_price numeric(12,2);
  v_new_stock integer;
  v_conflicts integer := 0;
begin
  if not public.is_active_user() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_status not in ('completed','cancelled') then
    raise exception 'Invalid status: %', p_status;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A sale needs at least one item';
  end if;

  select coalesce(sum(round(((i->>'quantity')::integer * (i->>'unit_price')::numeric), 2)), 0)
    into v_total from jsonb_array_elements(p_items) i;

  if p_status = 'completed' and coalesce(p_cash_received, 0) < v_total then
    raise exception 'Cash received is less than the total';
  end if;

  -- Idempotency: the same transaction id is only ever stored once
  insert into public.transactions
    (id, receipt_no, cashier_id, status, total_amount, cash_received, change_given, created_at)
  values
    (p_id, p_receipt_no, v_user, p_status, v_total,
     coalesce(p_cash_received, 0),
     case when p_status = 'completed' then coalesce(p_cash_received, 0) - v_total else 0 end,
     p_created_at)
  on conflict (id) do nothing;

  if not found then
    return jsonb_build_object('status', 'duplicate', 'id', p_id);
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    v_price := (v_item->>'unit_price')::numeric;
    if v_qty is null or v_qty <= 0 or v_price is null or v_price < 0 then
      raise exception 'Invalid item in sale';
    end if;

    select * into v_product from public.products
    where id = (v_item->>'product_id')::uuid for update;
    if not found then
      raise exception 'Unknown product %', v_item->>'product_id';
    end if;

    insert into public.transaction_items
      (transaction_id, product_id, product_name, sku, unit_price, quantity, line_total)
    values
      (p_id, v_product.id, v_product.name, v_product.sku, v_price, v_qty, round(v_qty * v_price, 2));

    if p_status = 'completed' then
      v_new_stock := greatest(v_product.stock_qty - v_qty, 0);

      -- The sale already happened at the counter, so it is NEVER rejected.
      -- If the server count was too low, floor at 0 and flag it for the admin.
      if v_product.stock_qty < v_qty then
        v_conflicts := v_conflicts + 1;
        insert into public.activity_logs (user_id, action, entity_type, entity_id, details, created_at)
        values (v_user, 'sync_stock_conflict', 'product', v_product.id::text,
                jsonb_build_object('transaction_id', p_id, 'sku', v_product.sku,
                                   'server_stock', v_product.stock_qty, 'sold', v_qty),
                p_created_at);
      end if;

      perform set_config('app.allow_stock_change', 'on', true);
      update public.products set stock_qty = v_new_stock where id = v_product.id;

      insert into public.inventory_movements
        (product_id, movement_type, quantity_change, stock_before, stock_after,
         reason, transaction_id, created_by, created_at)
      values
        (v_product.id, 'sale', -v_qty, v_product.stock_qty, v_new_stock,
         case when v_product.stock_qty < v_qty
              then 'Sale (server stock was insufficient; floored at 0)'
              else 'Sale' end,
         p_id, v_user, p_created_at);
    end if;
  end loop;

  insert into public.activity_logs (user_id, action, entity_type, entity_id, details, created_at)
  values (v_user,
          case when p_status = 'completed' then 'sale_completed' else 'sale_cancelled' end,
          'transaction', p_id::text,
          jsonb_build_object('receipt_no', p_receipt_no, 'total', v_total),
          p_created_at);

  return jsonb_build_object('status', 'created', 'id', p_id, 'stock_conflicts', v_conflicts);
end $$;

-- =====================================================================
-- Admin stock adjustment (add / deduct / set), idempotent by movement id
-- =====================================================================
create or replace function public.adjust_stock(
  p_movement_id uuid,
  p_product_id uuid,
  p_mode text,                 -- 'add' | 'deduct' | 'set'
  p_quantity integer,
  p_reason text,
  p_created_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_product public.products%rowtype;
  v_new integer;
  v_type text;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required';
  end if;
  if p_mode not in ('add','deduct','set') then
    raise exception 'Invalid mode: %', p_mode;
  end if;
  if p_quantity is null or p_quantity < 0 or (p_mode <> 'set' and p_quantity = 0) then
    raise exception 'Invalid quantity';
  end if;

  if exists (select 1 from public.inventory_movements where id = p_movement_id) then
    return jsonb_build_object('status', 'duplicate', 'id', p_movement_id);
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then raise exception 'Unknown product'; end if;

  if p_mode = 'add' then
    v_new := v_product.stock_qty + p_quantity; v_type := 'restock';
  elsif p_mode = 'deduct' then
    v_new := v_product.stock_qty - p_quantity; v_type := 'deduction';
    if v_new < 0 then raise exception 'Cannot deduct more than the current stock'; end if;
  else
    v_new := p_quantity; v_type := 'adjustment';
  end if;

  perform set_config('app.allow_stock_change', 'on', true);
  update public.products set stock_qty = v_new where id = p_product_id;

  insert into public.inventory_movements
    (id, product_id, movement_type, quantity_change, stock_before, stock_after,
     reason, created_by, created_at)
  values
    (p_movement_id, p_product_id, v_type, v_new - v_product.stock_qty,
     v_product.stock_qty, v_new, trim(p_reason), auth.uid(), p_created_at);

  insert into public.activity_logs (user_id, action, entity_type, entity_id, details, created_at)
  values (auth.uid(), 'stock_' || v_type, 'product', p_product_id::text,
          jsonb_build_object('before', v_product.stock_qty, 'after', v_new, 'reason', trim(p_reason)),
          p_created_at);

  return jsonb_build_object('status', 'created', 'id', p_movement_id, 'stock_after', v_new);
end $$;

-- Only signed-in users may call the RPCs
revoke all on function public.process_sale(uuid, text, timestamptz, text, numeric, jsonb) from public, anon;
revoke all on function public.adjust_stock(uuid, uuid, text, integer, text, timestamptz) from public, anon;
grant execute on function public.process_sale(uuid, text, timestamptz, text, numeric, jsonb) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, text, integer, text, timestamptz) to authenticated;

-- =====================================================================
-- Row Level Security
-- =====================================================================
revoke all on all tables in schema public from anon;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.activity_logs enable row level security;
alter table public.app_settings enable row level security;

-- profiles
create policy "profiles read own or admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles admin update" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- categories
create policy "categories read" on public.categories
  for select to authenticated using (public.is_active_user());
create policy "categories admin insert" on public.categories
  for insert to authenticated with check (public.is_admin());
create policy "categories admin update" on public.categories
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "categories admin delete" on public.categories
  for delete to authenticated using (public.is_admin());

-- products (stock itself is protected by the guard trigger)
create policy "products read" on public.products
  for select to authenticated using (public.is_active_user());
create policy "products admin insert" on public.products
  for insert to authenticated with check (public.is_admin());
create policy "products admin update" on public.products
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "products admin delete" on public.products
  for delete to authenticated using (public.is_admin());

-- movements, transactions, items: read-only from the client (writes go through RPCs)
create policy "movements read" on public.inventory_movements
  for select to authenticated using (public.is_active_user());
create policy "transactions read" on public.transactions
  for select to authenticated using (public.is_active_user());
create policy "transaction_items read" on public.transaction_items
  for select to authenticated using (public.is_active_user());

-- activity logs
create policy "logs admin read" on public.activity_logs
  for select to authenticated using (public.is_admin());
create policy "logs insert own" on public.activity_logs
  for insert to authenticated with check (public.is_active_user() and user_id = auth.uid());

-- settings
create policy "settings read" on public.app_settings
  for select to authenticated using (public.is_active_user());
create policy "settings admin insert" on public.app_settings
  for insert to authenticated with check (public.is_admin());
create policy "settings admin update" on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- Storage buckets (public read so images are easy to cache offline)
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true),
       ('branding', 'branding', true)
on conflict (id) do nothing;

create policy "admin upload images" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('product-images','branding') and public.is_admin());
create policy "admin update images" on storage.objects
  for update to authenticated
  using (bucket_id in ('product-images','branding') and public.is_admin());
create policy "admin delete images" on storage.objects
  for delete to authenticated
  using (bucket_id in ('product-images','branding') and public.is_admin());

-- =====================================================================
-- Default settings and starter categories (editable in the admin panel)
-- =====================================================================
insert into public.app_settings (key, value) values
  ('organization', '{"name": "Green Core Society", "school": "Saint Louis University", "department": "SAMCIS"}'),
  ('regional',     '{"currency": "PHP", "symbol": "₱", "timezone": "Asia/Manila"}'),
  ('inventory',    '{"default_low_stock_threshold": 5}')
on conflict (key) do nothing;

insert into public.categories (name) values
  ('Drinks'), ('Snacks'), ('Merchandise'), ('Plants'), ('Other')
on conflict do nothing;