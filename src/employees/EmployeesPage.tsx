import { useEffect, useRef, useSyncExternalStore, type ChangeEvent } from 'react';
import type { EmployeeEditableField, EmployeeRow } from '../domain/employees.ts';
import type { EmployeesController, EmployeesSnapshot } from './EmployeesController.ts';

type EmployeesPageProps = {
  controller: EmployeesController;
};

type EmployeeTextField = Extract<EmployeeEditableField, 'employee_code' | 'name' | 'customer_code'>;

function isDirty(snapshot: EmployeesSnapshot, id: string, field: EmployeeEditableField): boolean {
  const patch = snapshot.dirtyMap.get(String(id));
  return Boolean(patch && Object.prototype.hasOwnProperty.call(patch, field));
}

function EmployeeTextInput({
  controller,
  snapshot,
  employee,
  field
}: {
  controller: EmployeesController;
  snapshot: EmployeesSnapshot;
  employee: EmployeeRow;
  field: EmployeeTextField;
}) {
  const value = String(employee[field] || '');
  const classes = [
    field === 'customer_code' ? 'customer-code-input' : '',
    isDirty(snapshot, String(employee.id), field) ? 'dirty' : ''
  ].filter(Boolean).join(' ');
  return (
    <input
      className={classes || undefined}
      data-field={field}
      data-id={String(employee.id)}
      defaultValue={value}
      key={`${String(employee.id)}:${field}:${value}`}
      onBlur={event => controller.markDirty(String(employee.id), field, event.currentTarget.value)}
      type="text"
    />
  );
}

export function EmployeesPage({ controller }: EmployeesPageProps) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const newEmployeeCodeRef = useRef<HTMLInputElement>(null);
  const newNameRef = useRef<HTMLInputElement>(null);
  const newCustomerCodeRef = useRef<HTMLInputElement>(null);
  const newIsActiveRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void controller.loadEmployees();
  }, [controller]);

  useEffect(() => {
    if (!snapshot.showInlineNewEmployee) return;
    tableWrapRef.current?.scrollTo({ top: 0 });
    newEmployeeCodeRef.current?.focus();
  }, [snapshot.showInlineNewEmployee]);

  function markCheckbox(event: ChangeEvent<HTMLInputElement>, employee: EmployeeRow) {
    controller.markDirty(String(employee.id), 'is_active', event.currentTarget.checked);
  }

  function submitNewEmployee() {
    void controller.createEmployee({
      employee_code: newEmployeeCodeRef.current?.value || '',
      name: newNameRef.current?.value || '',
      customer_code: newCustomerCodeRef.current?.value || '',
      is_active: newIsActiveRef.current?.checked ?? true
    });
  }

  return (
    <div className="card">
      <div className="top">
        <h1>员工管理</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => { window.location.href = 'dashboard.html'; }} type="button">
            ← 返回管理后台
          </button>
          <button className="btn" onClick={() => void controller.loadEmployees()} type="button">刷新</button>
          <button
            className="btn"
            disabled={snapshot.showInlineNewEmployee || snapshot.creatingEmployee}
            id="addEmployeeBtn"
            onClick={() => controller.openInlineEmployeeRow()}
            type="button"
          >
            {snapshot.showInlineNewEmployee ? '正在添加' : '添加员工'}
          </button>
          <button className="btn primary" onClick={() => void controller.saveAllDirty()} type="button">
            保存修改
          </button>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="search"
          id="globalSearch"
          onChange={event => controller.setSearch(event.currentTarget.value)}
          placeholder="搜索：工号 / 姓名 / 经销商客户编号"
          value={snapshot.searchText}
        />
        <button className="btn" onClick={() => controller.clearSearch()} type="button">清空搜索</button>
      </div>

      <div className={`status${snapshot.statusKind ? ` ${snapshot.statusKind}` : ''}`} id="status">
        {snapshot.status}
      </div>
      <div className="table-wrap" ref={tableWrapRef}>
        <table>
          <thead>
            <tr>
              <th className="employee-code-col">员工工号</th>
              <th className="employee-name-col">员工姓名</th>
              <th className="customer-code-col">经销商客户编号</th>
              <th className="active-col">启用</th>
            </tr>
          </thead>
          <tbody id="tbody">
            {snapshot.showInlineNewEmployee && (
              <tr className="new-row">
                <td><input autoComplete="off" id="new_employee_code" placeholder="必填" ref={newEmployeeCodeRef} type="text" /></td>
                <td><input autoComplete="off" id="new_name" placeholder="必填" ref={newNameRef} type="text" /></td>
                <td>
                  <input
                    autoComplete="off"
                    className="customer-code-input"
                    id="new_customer_code"
                    placeholder="经销商客户编号"
                    ref={newCustomerCodeRef}
                    type="text"
                  />
                  <div className="inline-actions">
                    <button
                      className="btn primary"
                      disabled={snapshot.creatingEmployee}
                      id="createEmployeeBtn"
                      onClick={submitNewEmployee}
                      type="button"
                    >
                      {snapshot.creatingEmployee ? '提交中' : '提交'}
                    </button>
                    <button className="btn" onClick={() => controller.cancelInlineEmployeeRow()} type="button">取消</button>
                  </div>
                </td>
                <td><input defaultChecked id="new_is_active" ref={newIsActiveRef} type="checkbox" /></td>
              </tr>
            )}
            {snapshot.filtered.map(employee => (
              <tr key={String(employee.id)}>
                <td><EmployeeTextInput controller={controller} employee={employee} field="employee_code" snapshot={snapshot} /></td>
                <td><EmployeeTextInput controller={controller} employee={employee} field="name" snapshot={snapshot} /></td>
                <td><EmployeeTextInput controller={controller} employee={employee} field="customer_code" snapshot={snapshot} /></td>
                <td>
                  <input
                    checked={employee.is_active}
                    className={isDirty(snapshot, String(employee.id), 'is_active') ? 'dirty' : undefined}
                    data-field="is_active"
                    data-id={String(employee.id)}
                    onChange={event => markCheckbox(event, employee)}
                    type="checkbox"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
