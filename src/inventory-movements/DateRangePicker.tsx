import {
  dateOnlyValue,
  normalizedCustomRange,
  rangeDisplayValue
} from '../domain/inventory-movements';

type DateRangePickerProps = {
  baseMonth: Date;
  endDate: string;
  open: boolean;
  startDate: string;
  onClear: () => void;
  onClose: () => void;
  onOpen: () => void;
  onPick: (value: string) => void;
  onShiftMonth: (delta: number) => void;
};

type MonthCalendarProps = {
  baseMonth: Date;
  endDate: string;
  offset: number;
  startDate: string;
  onPick: (value: string) => void;
};

function MonthCalendar({ baseMonth, endDate, offset, startDate, onPick }: MonthCalendarProps) {
  const first = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + offset, 1);
  const year = first.getFullYear();
  const month = first.getMonth();
  const calendarStart = new Date(year, month, 1 - first.getDay());
  const selected = normalizedCustomRange(startDate, endDate);
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart.getFullYear(), calendarStart.getMonth(), calendarStart.getDate() + index);
    const value = dateOnlyValue(date);
    const classNames = [
      'range-day',
      date.getMonth() !== month ? 'muted' : '',
      selected.start && selected.end && value > selected.start && value < selected.end ? 'in-range' : '',
      value === selected.start || value === selected.end ? 'active' : ''
    ].filter(Boolean).join(' ');
    return (
      <button className={classNames} key={value} onClick={() => onPick(value)} type="button">
        {date.getDate()}
      </button>
    );
  });

  return (
    <div>
      <div className="range-month-title">{year}-{String(month + 1).padStart(2, '0')}</div>
      <div className="range-week">
        {['日', '一', '二', '三', '四', '五', '六'].map(day => <span key={day}>{day}</span>)}
      </div>
      <div className="range-days">{days}</div>
    </div>
  );
}

export function DateRangePicker({
  baseMonth,
  endDate,
  open,
  startDate,
  onClear,
  onClose,
  onOpen,
  onPick,
  onShiftMonth
}: DateRangePickerProps) {
  return (
    <div className="date-range-picker">
      <input
        id="customRangeText"
        className="date-input date-range-input"
        onClick={onOpen}
        placeholder="选择日期范围"
        readOnly
        type="text"
        value={rangeDisplayValue(startDate, endDate || startDate)}
      />
      <div id="dateRangePanel" className={`date-range-panel${open ? '' : ' hide'}`}>
        <div className="range-cal-head">
          <button aria-label="上一个月" onClick={() => onShiftMonth(-1)} type="button">‹</button>
          <span>{rangeDisplayValue(startDate, endDate || startDate)}</span>
          <button aria-label="下一个月" onClick={() => onShiftMonth(1)} type="button">›</button>
        </div>
        <div className="range-cal-grid">
          <MonthCalendar baseMonth={baseMonth} endDate={endDate} offset={0} startDate={startDate} onPick={onPick} />
          <MonthCalendar baseMonth={baseMonth} endDate={endDate} offset={1} startDate={startDate} onPick={onPick} />
        </div>
        <div className="range-picker-actions">
          <button onClick={onClear} type="button">清空</button>
          <button onClick={onClose} type="button">关闭</button>
        </div>
      </div>
    </div>
  );
}
