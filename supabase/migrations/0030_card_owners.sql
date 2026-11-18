-- How many players own at least one copy of a card (card inspector).
create function card_owners(p_card_id int) returns int
language plpgsql security definer set search_path = public as $$
begin
  perform require_player();
  return (select count(*)::int from inventory where card_id = p_card_id and count > 0);
end;
$$;

revoke execute on function card_owners(int) from public, anon;
grant execute on function card_owners(int) to authenticated;
