-- Supabase database documentation export
-- Project: new (wyjbnnqhiehjccmojbbg)
-- Schema: public
-- Object type: triggers
-- Generated at: 2026-06-21 01:15:42 +08
-- Note: Documentation DDL only. Do not run blindly as a migration.

CREATE TRIGGER trig_execute_dealer_stock_final
BEFORE INSERT ON public.raw_dealer_outbounds
FOR EACH ROW
EXECUTE FUNCTION public.process_dealer_stock_final();

CREATE TRIGGER trg_sync_van_stock
AFTER DELETE ON public.sales_order_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_van_stock_on_order_change_v4();
