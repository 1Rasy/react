import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildDashboardEmployeeRows,
  buildDashboardMetrics,
  buildDashboardTrendRows,
  dashboardTrendBounds,
  dashboardTrendLabelIndexes,
  dateOnlyValue,
  filterDashboardOrders,
  formatDashboardDateTime,
  formatDashboardMoney,
  formatPendingStockAdjustmentCount,
  formatDashboardTrendDate,
  normalizeCustomDateRange,
  rangeDisplayValue,
  visibleDashboardEmployees,
  type DashboardEmployee,
  type DashboardOrder,
  type DashboardRange,
  type DashboardTrendRow
} from '../domain/dashboard.ts';
import type {
  DashboardController,
  DashboardSelection
} from './DashboardController.ts';

export type DashboardPageProps = {
  controller: DashboardController;
};

const presetRanges: readonly { value: Exclude<DashboardRange, 'custom'>; label: string }[] = [
  { value: 'today', label: '本日' },
  { value: 'yesterday', label: '昨日' },
  { value: '7d', label: '近 7 天' },
  { value: 'month', label: '本月' },
  { value: 'all', label: '全部历史' }
];

type CalendarDay = {
  value: string;
  day: number;
  muted: boolean;
  active: boolean;
  inRange: boolean;
};

function calendarDays(
  base: Date,
  offset: number,
  selectedStart: string,
  selectedEnd: string
): { title: string; days: CalendarDay[] } {
  const first = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const year = first.getFullYear();
  const month = first.getMonth();
  const start = new Date(year, month, 1 - first.getDay());
  const selected = normalizeCustomDateRange(selectedStart, selectedEnd);
  return {
    title: `${year}-${String(month + 1).padStart(2, '0')}`,
    days: Array.from({ length: 42 }, (_, index) => {
      const date = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + index
      );
      const value = dateOnlyValue(date);
      return {
        value,
        day: date.getDate(),
        muted: date.getMonth() !== month,
        active: value === selected.start || value === selected.end,
        inRange: Boolean(
          selected.start &&
          selected.end &&
          value > selected.start &&
          value < selected.end
        )
      };
    })
  };
}

type DateRangePickerProps = {
  open: boolean;
  base: Date;
  start: string;
  end: string;
  onOpen: () => void;
  onClose: () => void;
  onClear: () => void;
  onShift: (delta: number) => void;
  onPick: (value: string) => void;
};

function DateRangePicker({
  open,
  base,
  start,
  end,
  onOpen,
  onClose,
  onClear,
  onShift,
  onPick
}: DateRangePickerProps) {
  const months = [calendarDays(base, 0, start, end), calendarDays(base, 1, start, end)];
  return (
    <div className="date-range-picker">
      <input
        id="customRangeText"
        className="date-input date-range-input"
        type="text"
        readOnly
        placeholder="选择日期范围"
        value={rangeDisplayValue(start, end || start)}
        onClick={onOpen}
      />
      <div id="dateRangePanel" className={`date-range-panel${open ? '' : ' hide'}`}>
        <div className="range-cal-head">
          <button onClick={() => onShift(-1)} type="button">‹</button>
          <span>{rangeDisplayValue(start, end || start)}</span>
          <button onClick={() => onShift(1)} type="button">›</button>
        </div>
        <div className="range-cal-grid">
          {months.map(month => (
            <div key={month.title}>
              <div className="range-month-title">{month.title}</div>
              <div className="range-week">
                {['日', '一', '二', '三', '四', '五', '六'].map(day => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="range-days">
                {month.days.map((day, index) => {
                  const classes = [
                    'range-day',
                    day.muted ? 'muted' : '',
                    day.inRange ? 'in-range' : '',
                    day.active ? 'active' : ''
                  ].filter(Boolean).join(' ');
                  return (
                    <button
                      className={classes}
                      key={`${day.value}-${index}`}
                      onClick={() => onPick(day.value)}
                      type="button"
                    >
                      {day.day}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="range-picker-actions">
          <button onClick={onClear} type="button">清空</button>
          <button onClick={onClose} type="button">关闭</button>
        </div>
      </div>
    </div>
  );
}

function Metrics({ orders }: { orders: readonly DashboardOrder[] }) {
  const metrics = buildDashboardMetrics(orders);
  const cards = [
    ['💵', '卖进金额', `¥ ${formatDashboardMoney(metrics.totalAmount)}`],
    ['🧾', '卖进单据', String(metrics.orderCount)],
    ['📈', '平均客单价', formatDashboardMoney(metrics.avgOrderAmount)]
  ];
  return (
    <>
      {cards.map(card => (
        <div className="metric" key={card[1]}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div className="metric-icon">{card[0]}</div>
            <div className="metric-label">{card[1]}</div>
          </div>
          <div className="metric-value">{card[2]}</div>
        </div>
      ))}
    </>
  );
}

function EmployeeRanking({
  orders,
  employees
}: {
  orders: readonly DashboardOrder[];
  employees: readonly DashboardEmployee[];
}) {
  const rows = buildDashboardEmployeeRows(orders, employees);
  if (!rows.length) {
    return <tr><td colSpan={6} className="empty">暂无数据</td></tr>;
  }
  return (
    <>
      {rows.map((row, index) => (
        <tr key={row.code}>
          <td><span className="rank">{index + 1}</span></td>
          <td>
            <strong>{row.name}</strong>
            <div className="emp-code">{row.code}</div>
          </td>
          <td className="amount">¥ {formatDashboardMoney(row.total)}</td>
          <td>{row.count}</td>
          <td>¥ {formatDashboardMoney(row.count ? row.total / row.count : 0)}</td>
          <td>{formatDashboardDateTime(row.last)}</td>
        </tr>
      ))}
    </>
  );
}

function TrendLine({
  rows,
  labelAll
}: {
  rows: readonly DashboardTrendRow[];
  labelAll: boolean;
}) {
  const width = 720;
  const height = 260;
  const padX = 44;
  const padY = 46;
  const padBottom = 38;
  const innerWidth = width - padX * 2;
  const innerHeight = height - padY - padBottom;
  const bounds = dashboardTrendBounds(rows);
  const points = rows.map(([date, value], index) => {
    const x = rows.length === 1
      ? width / 2
      : padX + index * (innerWidth / (rows.length - 1));
    const y = padY + innerHeight - (Number(value || 0) / bounds.max) * innerHeight;
    return { x, y, date, value: Number(value || 0) };
  });
  const path = points
    .map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ');
  const baseY = height - padBottom;
  const labels = new Set(dashboardTrendLabelIndexes(points.length, labelAll));

  return (
    <div className="trend-figure">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="trend-line-svg"
        shapeRendering="geometricPrecision"
      >
        <text x={padX} y="18" fill="#756676" fontSize="16" fontWeight="700">
          ¥ {formatDashboardMoney(bounds.max)}
        </text>
        <text x={padX} y={height - 8} fill="#756676" fontSize="16" fontWeight="700">
          {bounds.min === null ? '-' : `¥ ${formatDashboardMoney(bounds.min)}`}
        </text>
        <line
          x1={padX}
          y1={baseY}
          x2={width - padX}
          y2={baseY}
          stroke="#e7e1e8"
          strokeWidth="2"
        />
        {points.length > 1 && (
          <polygon
            points={`${padX},${baseY} ${path} ${width - padX},${baseY}`}
            fill="rgba(74,21,75,.055)"
          />
        )}
        <polyline
          points={path}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map(point => (
          <circle
            key={point.date}
            cx={point.x.toFixed(1)}
            cy={point.y.toFixed(1)}
            r="5"
            fill="#fff"
            stroke="var(--primary)"
            strokeWidth="4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="trend-axis">
        {points.map((point, index) => (
          labels.has(index)
            ? <span key={point.date}>{formatDashboardTrendDate(point.date)}</span>
            : null
        ))}
      </div>
    </div>
  );
}

function TrendChart({
  orders,
  range
}: {
  orders: readonly DashboardOrder[];
  range: DashboardRange;
}) {
  if (!orders.length) return <div className="empty">暂无趋势数据</div>;
  const rows = buildDashboardTrendRows(orders, range);
  return <TrendLine rows={rows} labelAll={range === '7d'} />;
}

export function DashboardPage({ controller }: DashboardPageProps) {
  const [range, setRange] = useState<DashboardRange>('7d');
  const [renderedRange, setRenderedRange] = useState<DashboardRange>('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [calendarBase, setCalendarBase] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState('');
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [employees, setEmployees] = useState<DashboardEmployee[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [status, setStatus] = useState({
    text: '正在加载...',
    error: false,
    hidden: false
  });
  const [pendingCount, setPendingCount] = useState(0);

  const selection = useCallback((
    nextRange = range,
    nextStart = customStart,
    nextEnd = customEnd
  ): DashboardSelection => ({
    range: nextRange,
    customStart: nextStart,
    customEnd: nextEnd
  }), [range, customStart, customEnd]);

  const loadDashboard = useCallback(async (next: DashboardSelection) => {
    setStatus({ text: '正在加载...', error: false, hidden: false });
    const result = await controller.loadDashboard(next);
    if (!result.ok) {
      setStatus({ text: result.message, error: true, hidden: false });
      return false;
    }
    setOrders(result.orders);
    setEmployees(result.employees);
    setRenderedRange(next.range);
    setHasLoaded(true);
    setStatus({ text: '', error: false, hidden: true });
    return true;
  }, [controller]);

  useEffect(() => {
    let active = true;
    void controller.loadDashboard({
      range: '7d',
      customStart: '',
      customEnd: ''
    }).then(result => {
      if (!active) return;
      if (!result.ok) {
        setStatus({ text: result.message, error: true, hidden: false });
        return;
      }
      setOrders(result.orders);
      setEmployees(result.employees);
      setRenderedRange('7d');
      setHasLoaded(true);
      setStatus({ text: '', error: false, hidden: true });
    });
    void controller.loadPendingStockAdjustmentCount().then(count => {
      if (active) setPendingCount(count);
    });
    return () => { active = false; };
  }, [controller]);

  const filteredOrders = useMemo(
    () => filterDashboardOrders(orders, selectedEmployeeCode),
    [orders, selectedEmployeeCode]
  );
  const activeEmployees = useMemo(
    () => visibleDashboardEmployees(employees),
    [employees]
  );

  function choosePreset(nextRange: Exclude<DashboardRange, 'custom'>) {
    setRange(nextRange);
    setCustomStart('');
    setCustomEnd('');
    setPickerOpen(false);
    void loadDashboard(selection(nextRange, '', ''));
  }

  function openPicker() {
    setRange('custom');
    if (customStart) {
      const base = new Date(`${customStart}T00:00:00`);
      setCalendarBase(new Date(base.getFullYear(), base.getMonth(), 1));
    }
    setPickerOpen(true);
  }

  function pickDate(value: string) {
    if (!customStart || customEnd) {
      setCustomStart(value);
      setCustomEnd('');
      setRange('custom');
      void loadDashboard(selection('custom', value, ''));
      return;
    }
    const normalized = normalizeCustomDateRange(customStart, value);
    setCustomStart(normalized.start);
    setCustomEnd(normalized.end);
    setRange('custom');
    setPickerOpen(false);
    void loadDashboard(selection('custom', normalized.start, normalized.end));
  }

  function navigate(path: string) {
    window.location.href = path;
  }

  return (
    <div className="shell">
      <section className="hero">
        <div className="hero-main">
          <h1>管理后台</h1>
          <div className="hero-actions">
            <button className="btn hero-btn" onClick={() => navigate('index')} type="button">
              员工开单入口
            </button>
            <button
              className="btn hero-btn"
              onClick={() => void loadDashboard(selection())}
              type="button"
            >
              刷新数据
            </button>
          </div>
        </div>
      </section>

      <section className="panel quick-panel">
        <div className="nav-grid">
          <button className="nav-card" onClick={() => navigate('store_import')} type="button">
            <span className="nav-ico">📍</span><strong>导入门店</strong><b className="nav-arrow">›</b>
          </button>
          <button className="nav-card" onClick={() => navigate('stock_import')} type="button">
            <span className="nav-ico">📦</span><strong>库存导入</strong><b className="nav-arrow">›</b>
          </button>
          <button
            id="inventoryManagementCard"
            className="nav-card inventory-management-card"
            onClick={() => navigate('stock_summary')}
            type="button"
          >
            <span className="nav-ico">📊</span>
            <strong>库存管理</strong>
            <span
              id="pendingStockAdjustmentBadge"
              className={`notification-badge${pendingCount > 0 ? ' visible' : ''}`}
              aria-label="待审核库存修改"
            >
              {formatPendingStockAdjustmentCount(pendingCount)}
            </span>
            <b className="nav-arrow">›</b>
          </button>
          <button className="nav-card" onClick={() => navigate('products')} type="button">
            <span className="nav-ico">🍪</span><strong>商品表</strong><b className="nav-arrow">›</b>
          </button>
          <button className="nav-card" onClick={() => navigate('employees')} type="button">
            <span className="nav-ico">👥</span><strong>员工管理</strong><b className="nav-arrow">›</b>
          </button>
        </div>
      </section>

      <section className="panel filter-panel">
        <div className="range-row">
          {presetRanges.map(item => (
            <button
              id={`range_${item.value}`}
              className={`range-btn${range === item.value ? ' active' : ''}`}
              key={item.value}
              onClick={() => choosePreset(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
          <DateRangePicker
            open={pickerOpen}
            base={calendarBase}
            start={customStart}
            end={customEnd}
            onOpen={openPicker}
            onClose={() => setPickerOpen(false)}
            onClear={() => {
              setCustomStart('');
              setCustomEnd('');
            }}
            onShift={delta => setCalendarBase(base =>
              new Date(base.getFullYear(), base.getMonth() + delta, 1)
            )}
            onPick={pickDate}
          />
        </div>
        <div id="employeeFilter" className="employee-filter">
          {hasLoaded && (
            <>
              <button
                className={`employee-chip${selectedEmployeeCode ? '' : ' active'}`}
                onClick={event => {
                  event.currentTarget.blur();
                  setSelectedEmployeeCode('');
                }}
                type="button"
              >
                全部员工
              </button>
              {activeEmployees.map(employee => {
                const code = String(employee.employee_code || '');
                return (
                  <button
                    className={`employee-chip${selectedEmployeeCode === code ? ' active' : ''}`}
                    key={code}
                    onClick={event => {
                      event.currentTarget.blur();
                      setSelectedEmployeeCode(code);
                    }}
                    type="button"
                  >
                    {String(employee.name || employee.employee_code)}
                  </button>
                );
              })}
            </>
          )}
        </div>
      </section>

      <div
        id="status"
        className={[
          'status',
          status.error ? 'error' : '',
          status.hidden ? 'hide' : ''
        ].filter(Boolean).join(' ')}
      >
        {status.text}
      </div>

      <div className="metric-grid" id="metricGrid">
        {hasLoaded && <Metrics orders={filteredOrders} />}
      </div>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-title"><h2>卖进趋势</h2></div>
          <div className="chart-wrap" id="trendChart">
            {hasLoaded && <TrendChart orders={filteredOrders} range={renderedRange} />}
          </div>
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>卖进排行</h2>
            <button
              className="btn primary"
              onClick={() => void controller.exportOrderExcel(
                selection(),
                selectedEmployeeCode
              )}
              type="button"
            >
              导出开单单据
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 68 }}>排名</th>
                  <th>员工</th>
                  <th style={{ width: 130 }}>卖进金额</th>
                  <th style={{ width: 90 }}>单据</th>
                  <th style={{ width: 130 }}>客单价</th>
                  <th style={{ width: 120 }}>最近开单</th>
                </tr>
              </thead>
              <tbody id="employeeRankRows">
                {hasLoaded && (
                  <EmployeeRanking orders={filteredOrders} employees={employees} />
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
