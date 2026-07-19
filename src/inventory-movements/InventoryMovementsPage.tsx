import { useCallback, useEffect, useState } from 'react';
import {
  createInventoryWorkbook,
  inventoryExportFileName,
  normalizedCustomRange,
  resolveInventoryDateRange,
  shanghaiToday,
  type EmployeeOption,
  type InventoryMovement,
  type InventoryMovementFilters,
  type InventoryRange,
  type XlsxLibrary
} from '../domain/inventory-movements';
import type { InventoryMovementRepository } from '../services/inventory-movement-repository';
import { DateRangePicker } from './DateRangePicker';
import { InventoryMovementsTable } from './InventoryMovementsTable';

type InventoryMovementsPageProps = {
  repository: InventoryMovementRepository;
  xlsx?: XlsxLibrary;
};

type Status = { kind: 'normal' | 'error'; text: string };

export function InventoryMovementsPage({ repository, xlsx }: InventoryMovementsPageProps) {
  const [today] = useState(() => shanghaiToday());
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'normal', text: '正在加载库存流水...' });
  const [currentRange, setCurrentRange] = useState<InventoryRange>('all');
  const [customRangeStart, setCustomRangeStart] = useState('');
  const [customRangeEnd, setCustomRangeEnd] = useState('');
  const [dateRange, setDateRange] = useState(() => resolveInventoryDateRange('all', '', '', today));
  const [calendarBase, setCalendarBase] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [employeeCode, setEmployeeCode] = useState('');
  const [movementType, setMovementType] = useState('');

  const loadMovements = useCallback(async (filters: InventoryMovementFilters) => {
    setStatus({ kind: 'normal', text: '正在查询库存流水...' });
    try {
      const rows = await repository.listMovements(filters);
      setMovements(rows);
      setHasLoaded(true);
      setStatus({ kind: 'normal', text: `共 ${rows.length} 条` });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      console.error(error);
      setStatus({ kind: 'error', text: `查询失败：${message}` });
    }
  }, [repository]);

  useEffect(() => {
    let active = true;
    void repository.listEmployees().then(async rows => {
      if (!active) return;
      setEmployees(rows);
      setStatus({ kind: 'normal', text: '正在查询库存流水...' });
      try {
        const initialRows = await repository.listMovements({
          ...resolveInventoryDateRange('all', '', '', today),
          employeeCode: '',
          movementType: ''
        });
        if (!active) return;
        setMovements(initialRows);
        setHasLoaded(true);
        setStatus({ kind: 'normal', text: `共 ${initialRows.length} 条` });
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : '未知错误';
        console.error(error);
        setStatus({ kind: 'error', text: `查询失败：${message}` });
      }
    }).catch(error => {
      if (!active) return;
      const message = error instanceof Error ? error.message : '未知错误';
      setStatus({ kind: 'error', text: `加载失败：${message}` });
    });
    return () => { active = false; };
  }, [repository, today]);

  function filtersWith(
    nextDateRange = dateRange,
    nextEmployeeCode = employeeCode,
    nextMovementType = movementType
  ): InventoryMovementFilters {
    return { ...nextDateRange, employeeCode: nextEmployeeCode, movementType: nextMovementType };
  }

  function selectAllRange() {
    const nextDateRange = resolveInventoryDateRange('all', customRangeStart, customRangeEnd, today);
    setCurrentRange('all');
    setPickerOpen(false);
    setDateRange(nextDateRange);
    void loadMovements(filtersWith(nextDateRange));
  }

  function openDateRangePicker() {
    setCurrentRange('custom');
    if (!calendarBase) {
      const base = customRangeStart ? new Date(`${customRangeStart}T00:00:00`) : new Date(`${today}T00:00:00`);
      setCalendarBase(new Date(base.getFullYear(), base.getMonth(), 1));
    }
    setPickerOpen(true);
  }

  function shiftRangeMonth(delta: number) {
    setCalendarBase(base => {
      const current = base || new Date(`${today}T00:00:00`);
      return new Date(current.getFullYear(), current.getMonth() + delta, 1);
    });
  }

  function pickRangeDate(value: string) {
    let nextStart: string;
    let nextEnd: string;
    let closeAfterPick = false;
    if (!customRangeStart || customRangeEnd) {
      nextStart = value;
      nextEnd = '';
    } else {
      const normalized = normalizedCustomRange(customRangeStart, value);
      nextStart = normalized.start;
      nextEnd = normalized.end;
      closeAfterPick = true;
    }
    const nextDateRange = resolveInventoryDateRange('custom', nextStart, nextEnd, today);
    setCustomRangeStart(nextStart);
    setCustomRangeEnd(nextEnd);
    setDateRange(nextDateRange);
    if (closeAfterPick) setPickerOpen(false);
    void loadMovements(filtersWith(nextDateRange));
  }

  function changeEmployee(nextEmployeeCode: string) {
    setEmployeeCode(nextEmployeeCode);
    void loadMovements(filtersWith(dateRange, nextEmployeeCode));
  }

  function changeMovementType(nextMovementType: string) {
    setMovementType(nextMovementType);
    void loadMovements(filtersWith(dateRange, employeeCode, nextMovementType));
  }

  function exportMovements() {
    if (!xlsx) throw new Error('Excel 导出组件加载失败');
    const workbook = createInventoryWorkbook(xlsx, movements);
    xlsx.writeFile(workbook, inventoryExportFileName(dateRange.startDate, dateRange.endDate));
  }

  return (
    <main className="shell admin-stock-page inventory-movements-page">
      <section className="page-card page-header-card">
        <div className="page-header">
          <div className="page-title-wrap"><h1>库存流水</h1></div>
          <div className="page-actions">
            <button className="btn" onClick={() => { window.location.href = 'stock_summary'; }} type="button">返回库存管理</button>
            <button id="refresh" className="btn primary" onClick={() => void loadMovements(filtersWith())} type="button">刷新</button>
          </div>
        </div>
        <div className="filter-row movements-filter-row">
          <div className="range-row">
            <button id="range_all" className={`range-btn${currentRange === 'all' ? ' active' : ''}`} onClick={selectAllRange} type="button">全部</button>
            <DateRangePicker
              baseMonth={calendarBase || new Date(`${today}T00:00:00`)}
              endDate={customRangeEnd}
              open={pickerOpen}
              startDate={customRangeStart}
              onClear={() => { setCustomRangeStart(''); setCustomRangeEnd(''); }}
              onClose={() => setPickerOpen(false)}
              onOpen={openDateRangePicker}
              onPick={pickRangeDate}
              onShiftMonth={shiftRangeMonth}
            />
          </div>
          <label className="filter-field">业务员
            <select id="employee" onChange={event => changeEmployee(event.currentTarget.value)} value={employeeCode}>
              <option value="">全部业务员</option>
              {employees.map(employee => <option key={employee.employee_code} value={employee.employee_code}>{employee.name}</option>)}
            </select>
          </label>
          <label className="filter-field">变化类型
            <select id="type" onChange={event => changeMovementType(event.currentTarget.value)} value={movementType}>
              <option value="">全部库存变化类型</option>
              <option value="manual_adjustment">人工库存调整</option>
            </select>
          </label>
          <button id="export" className="btn" onClick={exportMovements} type="button">导出 Excel</button>
          <input id="start" type="hidden" value={dateRange.startDate} />
          <input id="end" type="hidden" value={dateRange.endDate} />
        </div>
        <p id="status" className={`status${status.kind === 'error' ? ' error' : ''}`}>{status.text}</p>
      </section>
      <InventoryMovementsTable hasLoaded={hasLoaded} movements={movements} />
    </main>
  );
}
