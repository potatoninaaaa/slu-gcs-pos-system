-- Skip the automatic "initial stock" movement while restoring a backup
create or replace function public.log_initial_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.restoring', true), 'off') = 'on' then
    return new;
  end if;
  if new.stock_qty > 0 then
    insert into public.inventory_movements
      (product_id, movement_type, quantity_change, stock_before, stock_after, reason, created_by)
    values (new.id, 'initial', new.stock_qty, 0, new.stock_qty, 'Initial stock', auth.uid());
  end if;
  return new;
end $$;

-- Adds anything missing from a backup. Never overwrites or duplicates existing records.
create or replace function public.restore_backup(p_data jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cat int := 0; v_prod int := 0; v_tx int := 0; v_items int := 0;
  v_mov int := 0; v_log int := 0; v_set int := 0;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Invalid backup';
  end if;
  perform set_config('app.restoring', 'on', true);

  with ins as (
    insert into public.categories (id, name, is_archived, created_at, updated_at)
    select x.id, x.name, coalesce(x.is_archived, false), coalesce(x.created_at, now()), coalesce(x.updated_at, now())
    from jsonb_to_recordset(coalesce(p_data->'categories', '[]'::jsonb))
      as x(id uuid, name text, is_archived boolean, created_at timestamptz, updated_at timestamptz)
    on conflict do nothing
    returning 1)
  select count(*) into v_cat from ins;

  with ins as (
    insert into public.products
      (id, sku, name, description, category_id, price, stock_qty, low_stock_threshold,
       is_available, is_archived, image_path, created_at, updated_at)
    select x.id, x.sku, x.name, x.description,
      case when exists (select 1 from public.categories c where c.id = x.category_id) then x.category_id end,
      x.price, x.stock_qty, coalesce(x.low_stock_threshold, 5),
      coalesce(x.is_available, true), coalesce(x.is_archived, false), x.image_path,
      coalesce(x.created_at, now()), coalesce(x.updated_at, now())
    from jsonb_to_recordset(coalesce(p_data->'products', '[]'::jsonb))
      as x(id uuid, sku text, name text, description text, category_id uuid, price numeric,
           stock_qty int, low_stock_threshold int, is_available boolean, is_archived boolean,
           image_path text, created_at timestamptz, updated_at timestamptz)
    on conflict do nothing
    returning 1)
  select count(*) into v_prod from ins;

  with ins as (
    insert into public.transactions
      (id, receipt_no, cashier_id, status, total_amount, cash_received, change_given, created_at)
    select t.id, t.receipt_no,
      case when exists (select 1 from auth.users u where u.id = t.cashier_id) then t.cashier_id end,
      t.status, t.total_amount, coalesce(t.cash_received, 0), coalesce(t.change_given, 0), t.created_at
    from jsonb_to_recordset(coalesce(p_data->'transactions', '[]'::jsonb))
      as t(id uuid, receipt_no text, cashier_id uuid, status text, total_amount numeric,
           cash_received numeric, change_given numeric, created_at timestamptz)
    on conflict do nothing
    returning id),
  it as (
    insert into public.transaction_items
      (transaction_id, product_id, product_name, sku, unit_price, quantity, line_total)
    select t.id, i.product_id, i.product_name, i.sku, i.unit_price, i.quantity, i.line_total
    from jsonb_to_recordset(coalesce(p_data->'transactions', '[]'::jsonb)) as t(id uuid, items jsonb)
    join ins on ins.id = t.id
    cross join lateral jsonb_to_recordset(coalesce(t.items, '[]'::jsonb))
      as i(product_id uuid, product_name text, sku text, unit_price numeric, quantity int, line_total numeric)
    where exists (select 1 from public.products p where p.id = i.product_id)
    returning 1)
  select (select count(*) from ins), (select count(*) from it) into v_tx, v_items;

  with ins as (
    insert into public.inventory_movements
      (id, product_id, movement_type, quantity_change, stock_before, stock_after,
       reason, transaction_id, created_by, created_at)
    select x.id, x.product_id, x.movement_type, x.quantity_change, x.stock_before, x.stock_after,
      x.reason, x.transaction_id,
      case when exists (select 1 from auth.users u where u.id = x.created_by) then x.created_by end,
      coalesce(x.created_at, now())
    from jsonb_to_recordset(coalesce(p_data->'movements', '[]'::jsonb))
      as x(id uuid, product_id uuid, movement_type text, quantity_change int, stock_before int,
           stock_after int, reason text, transaction_id uuid, created_by uuid, created_at timestamptz)
    where exists (select 1 from public.products p where p.id = x.product_id)
    on conflict do nothing
    returning 1)
  select count(*) into v_mov from ins;

  with ins as (
    insert into public.activity_logs (id, user_id, action, entity_type, entity_id, details, created_at)
    select x.id,
      case when exists (select 1 from auth.users u where u.id = x.user_id) then x.user_id end,
      x.action, x.entity_type, x.entity_id, coalesce(x.details, '{}'::jsonb), coalesce(x.created_at, now())
    from jsonb_to_recordset(coalesce(p_data->'logs', '[]'::jsonb))
      as x(id uuid, user_id uuid, action text, entity_type text, entity_id text,
           details jsonb, created_at timestamptz)
    on conflict do nothing
    returning 1)
  select count(*) into v_log from ins;

  with ins as (
    insert into public.app_settings (key, value)
    select x.key, x.value
    from jsonb_to_recordset(coalesce(p_data->'settings', '[]'::jsonb)) as x(key text, value jsonb)
    on conflict do nothing
    returning 1)
  select count(*) into v_set from ins;

  insert into public.activity_logs (user_id, action, entity_type, details)
  values (auth.uid(), 'backup_restored', 'backup',
    jsonb_build_object('categories', v_cat, 'products', v_prod, 'transactions', v_tx,
                       'items', v_items, 'movements', v_mov, 'logs', v_log));

  return jsonb_build_object('categories', v_cat, 'products', v_prod, 'transactions', v_tx,
    'transaction_items', v_items, 'movements', v_mov, 'logs', v_log, 'settings', v_set);
end $$;

revoke all on function public.restore_backup(jsonb) from public, anon;
grant execute on function public.restore_backup(jsonb) to authenticated;