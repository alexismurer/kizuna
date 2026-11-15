-- Free booster stock, rarity roll, player status

create function free_stock_at(p_stock int, p_at timestamptz, p_now timestamptz)
returns table(stock int, next_at timestamptz)
language sql immutable as $$
  with g as (
    select greatest(0, floor(extract(epoch from (p_now - p_at)) / 600))::int as gained
  )
  select
    least(10, p_stock + g.gained),
    case when p_stock + g.gained >= 10 then null
         else p_at + (g.gained + 1) * interval '10 minutes' end
  from g
$$;

create function roll_rarity(p_floor rarity, p_multipliers jsonb, p_r float8)
returns rarity
language plpgsql immutable as $$
declare
  v_names rarity[] := enum_range(null::rarity);
  v_base float8[] := array[62, 25, 11.4, 1.4, 0.15, 0.025];
  v_w float8[] := '{}';
  v_total float8 := 0;
  v_acc float8 := 0;
  v_start int := array_position(enum_range(null::rarity), p_floor);
  i int;
  w float8;
begin
  for i in v_start..6 loop
    w := v_base[i] * coalesce((p_multipliers ->> v_names[i]::text)::float8, 1);
    v_w[i] := w;
    v_total := v_total + w;
  end loop;
  for i in v_start..6 loop
    v_acc := v_acc + v_w[i];
    if p_r < v_acc / v_total then
      return v_names[i];
    end if;
  end loop;
  return v_names[6];
end;
$$;

create function my_status() returns json
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_stock record;
begin
  v_player := require_player();
  select * into v_stock from free_stock_at(v_player.free_stock, v_player.stock_at, now());
  return json_build_object(
    'freeStock', v_stock.stock,
    'nextFreeAt', v_stock.next_at,
    'currency', v_player.currency,
    'untilGolden', 10 - v_player.standard_opened % 10,
    'untilPity', 250 - v_player.pity,
    'dailyOpenedToday', v_player.daily_opened_on is not distinct from (now() at time zone 'Europe/Paris')::date
  );
end;
$$;

revoke execute on function free_stock_at(int, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function roll_rarity(rarity, jsonb, float8) from public, anon, authenticated;
grant execute on function free_stock_at(int, timestamptz, timestamptz) to service_role;
grant execute on function roll_rarity(rarity, jsonb, float8) to service_role;
revoke execute on function my_status() from public, anon;
grant execute on function my_status() to authenticated;
