export type LegacyPage = {
  file: string;
  cleanPath: string;
  title: string;
  risk: 'low' | 'medium' | 'high';
};

export const legacyPages: readonly LegacyPage[] = [
  { file: 'index.html', cleanPath: '/', title: '员工选择', risk: 'high' },
  { file: 'store.html', cleanPath: '/store', title: '门店开单', risk: 'high' },
  { file: 'store_new.html', cleanPath: '/store_new', title: '线外门店', risk: 'high' },
  { file: 'store_report.html', cleanPath: '/store_report', title: '员工卖进报表', risk: 'high' },
  { file: 'store_stock.html', cleanPath: '/store_stock', title: '员工库存', risk: 'high' },
  { file: 'dashboard.html', cleanPath: '/dashboard', title: '管理看板', risk: 'medium' },
  { file: 'employees.html', cleanPath: '/employees', title: '员工管理', risk: 'medium' },
  { file: 'products.html', cleanPath: '/products', title: '商品管理', risk: 'medium' },
  { file: 'store_import.html', cleanPath: '/store_import', title: '门店导入', risk: 'high' },
  { file: 'store_import-legacy.html', cleanPath: '/store_import-legacy', title: '门店导入（旧版回退）', risk: 'high' },
  { file: 'stock_import.html', cleanPath: '/stock_import', title: '库存原始记录导入', risk: 'high' },
  { file: 'stock_import-legacy.html', cleanPath: '/stock_import-legacy', title: '库存原始记录导入（旧版回退）', risk: 'high' },
  { file: 'stock_summary.html', cleanPath: '/stock_summary', title: '库存管理', risk: 'high' },
  { file: 'stock_summary-legacy.html', cleanPath: '/stock_summary-legacy', title: '库存管理（旧版回退）', risk: 'high' },
  { file: 'stock-adjustment-review.html', cleanPath: '/stock-adjustment-review', title: '库存调整审核', risk: 'high' },
  { file: 'stock-adjustment-review-legacy.html', cleanPath: '/stock-adjustment-review-legacy', title: '库存调整审核（旧版回退）', risk: 'high' },
  { file: 'inventory-movements.html', cleanPath: '/inventory-movements', title: '库存流水', risk: 'medium' },
  { file: 'inventory-movements-legacy.html', cleanPath: '/inventory-movements-legacy', title: '库存流水（旧版回退）', risk: 'medium' },
  { file: 'stock_jn.html', cleanPath: '/stock_jn', title: '吉能库存导入', risk: 'high' },
  { file: 'stock_jn-legacy.html', cleanPath: '/stock_jn-legacy', title: '吉能库存导入（旧版回退）', risk: 'high' },
  { file: 'stock_ct.html', cleanPath: '/stock_ct', title: '长涛库存导入', risk: 'high' },
  { file: 'stock_ct-legacy.html', cleanPath: '/stock_ct-legacy', title: '长涛库存导入（旧版回退）', risk: 'high' },
  { file: 'stock.html', cleanPath: '/stock', title: '库存调整跳转', risk: 'high' },
  { file: 'order.html', cleanPath: '/order', title: '旧独立开单', risk: 'high' },
  { file: 'report.html', cleanPath: '/report', title: '旧独立报表', risk: 'high' }
] as const;
