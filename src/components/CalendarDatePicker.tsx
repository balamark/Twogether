import { useState } from 'react';
import { formatMonthYear } from '../utils/datetime';

interface CalendarDatePickerProps {
  selectedDate: string;
  onDateSelect: (date: string) => void;
  primaryTimezone: string;
}

// Calendar component for date picking. Defined at module scope (not inside App)
// so its identity is stable across App re-renders — a nested definition would
// remount on every render and reset the displayed month. See issue #41.
const CalendarDatePicker = ({ selectedDate, onDateSelect, primaryTimezone }: CalendarDatePickerProps) => {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const date = selectedDate ? new Date(selectedDate) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];

    // Previous month's trailing days
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const day = new Date(year, month, -i);
      days.push({ date: day, isCurrentMonth: false });
    }

    // Current month's days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      days.push({ date, isCurrentMonth: true });
    }

    // Next month's leading days
    const remainingDays = 42 - days.length; // 6 rows × 7 days
    for (let day = 1; day <= remainingDays; day++) {
      const date = new Date(year, month + 1, day);
      days.push({ date, isCurrentMonth: false });
    }

    return days;
  };

  const formatDate = (date: Date) => {
    // Grid cells are local-time Dates from `new Date(y, m, d)` — read local
    // components directly. toISOString() would shift to UTC and mis-key.
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const isSelected = (date: Date) => {
    return formatDate(date) === selectedDate;
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const days = getDaysInMonth(currentMonth);
  const monthYear = formatMonthYear(currentMonth, primaryTimezone);

  return (
    <div className="bg-white rounded-md p-5 border border-petal-rule">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
          className="w-8 h-8 border border-petal-rule rounded-full text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors"
        >
          ‹
        </button>
        <h3 className="font-display italic font-light text-lg text-petal-ink">{monthYear}</h3>
        <button
          onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
          className="w-8 h-8 border border-petal-rule rounded-full text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {['日', '一', '二', '三', '四', '五', '六'].map(day => (
          <div key={day} className="p-2 text-center font-body text-[10px] font-medium uppercase tracking-[0.14em] text-petal-muted">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((dayInfo, index) => {
          const { date, isCurrentMonth } = dayInfo;
          const selected = isSelected(date);
          const today = isToday(date);

          return (
            <button
              key={index}
              onClick={() => onDateSelect(formatDate(date))}
              className={`
                p-2 font-display text-sm rounded-full hover:bg-petal-cream-2 transition-colors
                ${isCurrentMonth ? 'text-petal-ink' : 'text-petal-rule'}
                ${selected ? 'bg-petal-rose-deep text-petal-cream hover:bg-petal-rose-deep italic' : ''}
                ${today && !selected ? 'border border-petal-rose-deep text-petal-rose-deep' : ''}
              `}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CalendarDatePicker;
