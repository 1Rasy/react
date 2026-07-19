(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StockAdjustmentApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const MIGRATION_MESSAGE = '库存调整功能尚未完成数据库部署，请联系管理员。';

  function normalizeError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    if (
      code === 'PGRST202' ||
      code === '42883' ||
      /could not find (the )?function|function .* does not exist|schema cache/i.test(message)
    ) {
      return new Error(MIGRATION_MESSAGE);
    }
    if (error instanceof Error) return error;
    return new Error(message || '库存调整操作失败');
  }

  function create(client) {
    if (!client || typeof client.rpc !== 'function') {
      throw new Error('Supabase client 未初始化');
    }

    async function rpc(name, args) {
      let response;
      try {
        response = await client.rpc(name, args);
      } catch (error) {
        throw normalizeError(error);
      }
      const { data, error } = response || {};
      if (error) throw normalizeError(error);
      return data;
    }

    return {
      saveAndSubmit: (id, employee, reason, note, remark, items) => rpc('save_and_submit_stock_adjustment_request', {
        p_request_id: id || null,
        p_employee_code: employee,
        p_reason_code: reason,
        p_reason_note: note || null,
        p_remark: remark || null,
        p_items: items,
      }),
      save: (id, employee, reason, note, remark, items) => rpc('save_stock_adjustment_request', {
        p_request_id: id || null,
        p_employee_code: employee,
        p_reason_code: reason,
        p_reason_note: note || null,
        p_remark: remark || null,
        p_items: items,
      }),
      submit: (id, employee) => rpc('submit_stock_adjustment_request', {
        p_request_id: id,
        p_employee_code: employee,
      }),
      withdraw: (id, employee) => rpc('withdraw_stock_adjustment_request', {
        p_request_id: id,
        p_employee_code: employee,
      }),
      mine: (employee, history) => rpc('get_my_stock_adjustment_requests', {
        p_employee_code: employee,
        p_include_history: Boolean(history),
      }),
      pending: () => rpc('get_pending_stock_adjustment_requests', {}),
      reviewHistory: limit => rpc('get_stock_adjustment_review_history', {
        p_limit: Number(limit) || 100,
      }),
      approve: (id, admin) => rpc('approve_stock_adjustment_request', {
        p_request_id: id,
        p_admin_code: admin,
      }),
      reject: (id, admin, reason) => rpc('reject_stock_adjustment_request', {
        p_request_id: id,
        p_admin_code: admin,
        p_rejection_reason: reason,
      }),
      movements: (start, end, employee, type) => rpc('get_inventory_movement_details', {
        p_start_date: start,
        p_end_date: end,
        p_employee_code: employee || null,
        p_movement_type: type || null,
      }),
    };
  }

  return { create };
});
