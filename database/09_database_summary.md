# Supabase Database Summary

Project: `new` (`wyjbnnqhiehjccmojbbg`)
Schema: `public`
Export time: `2026-06-21 01:15:42 +08`

This folder documents the public business schema only. Supabase internal schemas such as `auth`, `storage`, and `realtime` are intentionally excluded.

## Files

- `01_tables.sql`: table definitions and table-level primary/unique constraints
- `02_functions.sql`: public function definitions
- `03_triggers.sql`: public trigger definitions
- `04_foreign_keys.sql`: foreign key relationships
- `05_indexes.sql`: index definitions
- `06_views.sql`: view definitions
- `07_policies.sql`: RLS policy and RLS status export
- `08_sample_data.xlsx`: first 20 rows per table
- `09_database_summary.md`: this summary

## Tables

| Table | Approx rows | Purpose inferred from schema |
|---|---:|---|
| `raw_dealer_outbounds` | 708 | Raw dealer outbound/import data, including customer, product, quantity, amount, batch, and processed flag. |
| `employees` | 12 | Employee whitelist/master data keyed by `employee_code`. |
| `dealer_employee_mappings` | 12 | Maps dealer/customer codes to employee codes. |
| `products` | 172 | Product master data keyed by `barcode`. |
| `van_stocks` | 457 | Employee vehicle stock by employee and product barcode. |
| `employee_store_assets` | 4,153 | Store/customer asset list assigned to employees, keyed by `atom_code`. |
| `sales_orders` | 0 | Sales order header table keyed by `order_no`. |
| `sales_order_items` | 0 | Sales order line items keyed by order and product barcode. |
| `temp_upload_assets` | 0 | Temporary staging table for store asset upload. |

## Functions

| Function | Return type | Security | Inferred role |
|---|---|---|---|
| `import_and_filter_stores(p_store_json jsonb)` | `jsonb` | invoker | Imports store/dealer mappings from JSON only when employee exists. |
| `import_filtered_store_assets(p_raw_excel_json jsonb)` | `jsonb` | invoker | Intended to rebuild employee store assets from uploaded Excel JSON. |
| `process_dealer_stock_final()` | `trigger` | invoker | Before raw outbound insert, maps customer to employee and adds quantity into `van_stocks`. |
| `submit_sales_order_v2(...)` | `text` | invoker | Earlier sales order submit flow: writes order/items and updates stock from supplied stock updates. |
| `submit_sales_order_v4(...)` | `text` | invoker | Current-looking sales order submit flow: writes order/items and deducts stock. |
| `sync_and_mask_assets()` | `void` | invoker | Merges `temp_upload_assets` into `employee_store_assets`, masks old assets, and clears staging. |
| `sync_van_stock_from_outbounds()` | `trigger` | `SECURITY DEFINER` | Re-aggregates `raw_dealer_outbounds` into `van_stocks` for a mapped employee. No trigger currently references it. |
| `sync_van_stock_on_order_change_v4()` | `trigger` | invoker | On sales item delete, restores deleted quantity back to `van_stocks`. |

## Triggers

| Trigger | Table | Timing | Function |
|---|---|---|---|
| `trig_execute_dealer_stock_final` | `raw_dealer_outbounds` | `BEFORE INSERT FOR EACH ROW` | `process_dealer_stock_final()` |
| `trg_sync_van_stock` | `sales_order_items` | `AFTER DELETE FOR EACH ROW` | `sync_van_stock_on_order_change_v4()` |

## Foreign Keys

| Source | Target | Rule |
|---|---|---|
| `dealer_employee_mappings.employee_code` | `employees.employee_code` | `ON UPDATE CASCADE ON DELETE CASCADE` |
| `sales_order_items.order_no` | `sales_orders.order_no` | default |
| `sales_order_items.barcode` | `products.barcode` | default |
| `sales_orders.employee_code` | `employees.employee_code` | default |
| `sales_orders.atom_code` | `employee_store_assets.atom_code` | default |
| `van_stocks.employee_code` | `employees.employee_code` | `ON UPDATE CASCADE ON DELETE CASCADE` |
| `van_stocks.product_barcode` | `products.barcode` | `ON UPDATE CASCADE ON DELETE CASCADE` |

## Views

No public views or materialized views were found.

## RLS And Policies

No public RLS policies were found.

All 9 public tables currently have RLS disabled:

- `raw_dealer_outbounds`
- `employees`
- `dealer_employee_mappings`
- `products`
- `van_stocks`
- `employee_store_assets`
- `sales_orders`
- `sales_order_items`
- `temp_upload_assets`

This is a security risk for Supabase projects if these tables are exposed through client APIs and the `anon` or `authenticated` roles have privileges. Do not enable RLS blindly; enabling it without matching policies can block application access.

## Data Flow Diagram

Primary import and stock flow:

```text
employees
↓
dealer_employee_mappings
↓
raw_dealer_outbounds
↓
process_dealer_stock_final() trigger
↓
van_stocks
```

Sales order flow:

```text
employees
↓
employee_store_assets
↓
sales_orders
↓
sales_order_items
↓
sync_van_stock_on_order_change_v4() trigger
↓
van_stocks
```

Product relationship flow:

```text
products
↓
raw_dealer_outbounds
↓
van_stocks
```

```text
products
↓
sales_order_items
↓
van_stocks
```

Store asset upload flow:

```text
temp_upload_assets
↓
sync_and_mask_assets()
↓
employee_store_assets
↓
sales_orders
```

## Structural Notes And Potential Runtime Risks

- `import_filtered_store_assets()` references `employee_store_assets.customer_code` and `employee_store_assets.customer_name`, but the current table columns are `atom_code` and `store_name`.
- `submit_sales_order_v2()` references `van_stocks.created_at`, but the current table has `updated_at` and no `created_at`.
- `submit_sales_order_v4()` references `products.package_reg`, but the current `products` table has `pcs_per_case` and `pcs_per_box`, and no `package_reg`.
- `sync_van_stock_from_outbounds()` is defined as `SECURITY DEFINER`, but no current public trigger references it.
- `sales_orders` and `sales_order_items` are currently empty in the sampled data.
