-- Internal helper functions are called by triggers/RPCs and must not be exposed through PostgREST.
revoke all on function public.prevent_inventory_movement_mutation() from public, anon, authenticated;
revoke all on function public.stock_adjustment_snapshot(uuid) from public, anon, authenticated;
