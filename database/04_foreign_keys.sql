-- Supabase database documentation export
-- Project: new (wyjbnnqhiehjccmojbbg)
-- Schema: public
-- Object type: foreign keys
-- Generated at: 2026-06-21 01:15:42 +08
-- Note: Documentation DDL only. Do not run blindly as a migration.

ALTER TABLE public.dealer_employee_mappings
  ADD CONSTRAINT dealer_employee_mappings_employee_code_fkey
  FOREIGN KEY (employee_code) REFERENCES public.employees(employee_code)
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.sales_order_items
  ADD CONSTRAINT fk_sales_order_items_order
  FOREIGN KEY (order_no) REFERENCES public.sales_orders(order_no);

ALTER TABLE public.sales_order_items
  ADD CONSTRAINT fk_sales_order_items_product
  FOREIGN KEY (barcode) REFERENCES public.products(barcode);

ALTER TABLE public.sales_orders
  ADD CONSTRAINT fk_sales_orders_employee
  FOREIGN KEY (employee_code) REFERENCES public.employees(employee_code);

ALTER TABLE public.sales_orders
  ADD CONSTRAINT fk_sales_orders_store
  FOREIGN KEY (atom_code) REFERENCES public.employee_store_assets(atom_code);

ALTER TABLE public.van_stocks
  ADD CONSTRAINT van_stocks_employee_code_fkey
  FOREIGN KEY (employee_code) REFERENCES public.employees(employee_code)
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.van_stocks
  ADD CONSTRAINT van_stocks_product_barcode_fkey
  FOREIGN KEY (product_barcode) REFERENCES public.products(barcode)
  ON UPDATE CASCADE ON DELETE CASCADE;
