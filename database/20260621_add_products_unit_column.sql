-- 商品散件单位列
-- 用于前端展示不同商品的散件单位，例如：个、包、条、小盒、袋等。

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT '个';

COMMENT ON COLUMN public.products.unit IS '散件单位显示名称，例如：个、包、条、小盒、袋等。用于前端开单和库存页面展示。';
