-- Supabase database documentation export
-- Project: new (wyjbnnqhiehjccmojbbg)
-- Schema: public
-- Object type: indexes
-- Generated at: 2026-06-21 01:15:42 +08
-- Note: Documentation DDL only. Do not run blindly as a migration.

CREATE UNIQUE INDEX dealer_employee_mappings_customer_code_key ON public.dealer_employee_mappings USING btree (customer_code);
CREATE UNIQUE INDEX dealer_employee_mappings_pkey ON public.dealer_employee_mappings USING btree (id);
CREATE INDEX idx_mapping_cust_code ON public.dealer_employee_mappings USING btree (customer_code);

CREATE UNIQUE INDEX employee_store_assets_customer_code_key ON public.employee_store_assets USING btree (atom_code);
CREATE UNIQUE INDEX employee_store_assets_pkey ON public.employee_store_assets USING btree (id);
CREATE INDEX idx_asset_cust_code ON public.employee_store_assets USING btree (atom_code);
CREATE INDEX idx_asset_emp_code ON public.employee_store_assets USING btree (employee_code);
CREATE INDEX idx_employee_store_assets_active ON public.employee_store_assets USING btree (is_active);

CREATE UNIQUE INDEX employees_employee_code_key ON public.employees USING btree (employee_code);
CREATE UNIQUE INDEX employees_pkey ON public.employees USING btree (id);

CREATE UNIQUE INDEX products_barcode_key ON public.products USING btree (barcode);
CREATE UNIQUE INDEX products_pkey ON public.products USING btree (id);

CREATE INDEX idx_raw_dealer_barcode ON public.raw_dealer_outbounds USING btree (barcode);
CREATE INDEX idx_raw_dealer_cust_code ON public.raw_dealer_outbounds USING btree (customer_code);
CREATE UNIQUE INDEX raw_dealer_outbounds_pkey ON public.raw_dealer_outbounds USING btree (id);
CREATE UNIQUE INDEX unique_order_item ON public.raw_dealer_outbounds USING btree (order_no, barcode);

CREATE UNIQUE INDEX sales_order_items_pkey ON public.sales_order_items USING btree (id);

CREATE UNIQUE INDEX sales_orders_order_no_key ON public.sales_orders USING btree (order_no);
CREATE UNIQUE INDEX sales_orders_pkey ON public.sales_orders USING btree (id);

CREATE UNIQUE INDEX unique_employee_product_stock ON public.van_stocks USING btree (employee_code, product_barcode);
CREATE UNIQUE INDEX van_stocks_pkey ON public.van_stocks USING btree (id);
