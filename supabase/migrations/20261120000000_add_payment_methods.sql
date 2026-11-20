alter table public.transactions
  add column payment_method text not null default 'cash'
    check (payment_method in ('cash', 'gcash')),
  add column payment_reference text;

alter table public.transactions
  drop constraint paid_in_full,
  add constraint paid_in_full check (
    status <> 'completed'
    or payment_method = 'gcash'
    or cash_received >= total_amount
  ),
  add constraint gcash_no_cash_change check (
    payment_method <> 'gcash'
    or (cash_received = 0 and change_given = 0)
  );

drop function public.process_sale(uuid, text, timestamptz, text, numeric, jsonb);

create function public.process_sale(
  p_id uuid,
  p_receipt_no text,
  p_created_at timestamptz,
  p_status text,
  p_payment_method text,
  p_payment_reference text,
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
  if p_payment_method not in ('cash', 'gcash') then
    raise exception 'Invalid payment method: %', p_payment_method;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A sale needs at least one item';
  end if;

  select coalesce(sum(round(((i->>'quantity')::integer * (i->>'unit_price')::numeric), 2)), 0)
    into v_total from jsonb_array_elements(p_items) i;

  if p_status = 'completed' and p_payment_method = 'cash'
     and coalesce(p_cash_received, 0) < v_total then
    raise exception 'Cash received is less than the total';
  end if;
  if p_status = 'completed' and p_payment_method = 'gcash'
     and coalesce(p_cash_received, 0) <> 0 then
    raise exception 'GCash sales cannot include cash received';
  end if;

  insert into public.transactions
    (id, receipt_no, cashier_id, status, total_amount, payment_method, payment_reference,
     cash_received, change_given, created_at)
  values
    (p_id, p_receipt_no, v_user, p_status, v_total, p_payment_method,
     case when p_payment_method = 'gcash' then nullif(trim(p_payment_reference), '') end,
     coalesce(p_cash_received, 0),
     case when p_status = 'completed' and p_payment_method = 'cash'
          then coalesce(p_cash_received, 0) - v_total else 0 end,
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
          jsonb_build_object('receipt_no', p_receipt_no, 'total', v_total,
                             'payment_method', p_payment_method),
          p_created_at);

  return jsonb_build_object('status', 'created', 'id', p_id, 'stock_conflicts', v_conflicts);
end $$;

revoke all on function public.process_sale(uuid, text, timestamptz, text, text, text, numeric, jsonb)
  from public, anon;
grant execute on function public.process_sale(uuid, text, timestamptz, text, text, text, numeric, jsonb)
  to authenticated;

create function public.process_sale(
  p_id uuid,
  p_receipt_no text,
  p_created_at timestamptz,
  p_status text,
  p_cash_received numeric,
  p_items jsonb
) returns jsonb
language sql security definer set search_path = public as $$
  select public.process_sale(
    p_id, p_receipt_no, p_created_at, p_status, 'cash', null, p_cash_received, p_items
  );
$$;

revoke all on function public.process_sale(uuid, text, timestamptz, text, numeric, jsonb)
  from public, anon;
grant execute on function public.process_sale(uuid, text, timestamptz, text, numeric, jsonb)
  to authenticated;

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
      (id, receipt_no, cashier_id, status, total_amount, payment_method, payment_reference,
       cash_received, change_given, created_at)
    select t.id, t.receipt_no,
      case when exists (select 1 from auth.users u where u.id = t.cashier_id) then t.cashier_id end,
      t.status, t.total_amount, coalesce(t.payment_method, 'cash'), t.payment_reference,
      coalesce(t.cash_received, 0), coalesce(t.change_given, 0), t.created_at
    from jsonb_to_recordset(coalesce(p_data->'transactions', '[]'::jsonb))
      as t(id uuid, receipt_no text, cashier_id uuid, status text, total_amount numeric,
           payment_method text, payment_reference text, cash_received numeric, change_given numeric,
           created_at timestamptz)
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
