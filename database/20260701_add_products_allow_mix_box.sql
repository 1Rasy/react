-- Add product flag for mixed-box sales on the order page.
-- Safe to run more than once.
alter table public.products
  add column if not exists allow_mix_box boolean not null default false;

comment on column public.products.allow_mix_box is 'Whether this product specification can be sold as a mixed box across flavors.';
