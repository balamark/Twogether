import React, { useState, useEffect, useRef } from 'react';
import { Camera, MapPin, Play, Clock, Trash2, LayoutGrid, ListTree } from 'lucide-react';
import CalendarDatePicker from './CalendarDatePicker';
import InfoHint from './InfoHint';
import { IntimacyStatsCards, CalendarHeatmap } from './AchievementsView';
import { periodDateSet, fertileDateSet, predictedPeriodDateSet, addDays } from '../utils/cycle';
import { formatYmdInTz } from '../utils/datetime';
import { useScrollLock } from '../hooks/useScrollLock';
import { apiService } from '../services/api';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { Button } from './ui/Button';
import MomentResponseBar from './MomentResponseBar';
import type { CycleRecord, MomentReactionKey } from '../services/api';
import type { IntimateRecord, AuthState, Notification } from '../App';

// Image compression helper — pure, canvas-based. Co-located here since the
// calendar record form is its only caller.
const compressImage = (file: File, maxWidth: number = 800, maxHeight: number = 600, quality: number = 0.8): Promise<string> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      // Calculate new dimensions
      let { width, height } = img;
      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      // Draw and compress
      ctx?.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };

    img.src = URL.createObjectURL(file);
  });
};

// Whole calendar days between two YYYY-MM-DD strings (a is the later date).
// Returns null when either input can't be parsed. Used to show how long it had
// been since the previous intimacy when each record was logged.
const daysBetweenYmd = (laterYmd: string, earlierYmd: string): number | null => {
  const a = new Date(laterYmd + 'T00:00:00');
  const b = new Date(earlierYmd + 'T00:00:00');
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((a.getTime() - b.getTime()) / 86400000);
};

// Chinese-numeral date formatter for editorial meta lines. e.g. 二〇二五年九月七日
const toChineseNum = (n: number): string => {
  const cn = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (n < 10) return cn[n];
  if (n < 20) return n === 10 ? '十' : `十${cn[n - 10]}`;
  if (n < 30) return n === 20 ? '二十' : `二十${cn[n - 20]}`;
  return n === 30 ? '三十' : `三十${cn[n - 30]}`;
};
const chineseYear = (y: number): string =>
  y.toString().split('').map(c => '〇一二三四五六七八九'[parseInt(c, 10)]).join('');
const formatChineseDate = (d: Date): string =>
  `${chineseYear(d.getFullYear())}年${toChineseNum(d.getMonth() + 1)}月${toChineseNum(d.getDate())}日`;

interface CalendarViewProps {
  selectedDate: string;
  setSelectedDate: React.Dispatch<React.SetStateAction<string>>;
  intimateRecords: IntimateRecord[];
  setIntimateRecords: React.Dispatch<React.SetStateAction<IntimateRecord[]>>;
  cycleRecords: CycleRecord[];
  setCycleRecords: React.Dispatch<React.SetStateAction<CycleRecord[]>>;
  authState: AuthState;
  calendarMonth: Date;
  setCalendarMonth: React.Dispatch<React.SetStateAction<Date>>;
  editingRecord: IntimateRecord | null;
  setEditingRecord: React.Dispatch<React.SetStateAction<IntimateRecord | null>>;
  showRecordModal: boolean;
  setShowRecordModal: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedRecord: React.Dispatch<React.SetStateAction<IntimateRecord | null>>;
  setShowRecordDetail: React.Dispatch<React.SetStateAction<boolean>>;
  setDayPickerDate: React.Dispatch<React.SetStateAction<string | null>>;
  setDayPickerRecords: React.Dispatch<React.SetStateAction<IntimateRecord[]>>;
  setCurrentView: React.Dispatch<React.SetStateAction<string>>;
  addIntimateRecord: (
    date: string,
    time: string,
    mood: string,
    notes?: string,
    photo?: string,
    description?: string,
    duration?: string,
    location?: string,
    roleplayScript?: string,
    activityType?: string,
  ) => Promise<void>;
  showNotification: (notification: Omit<Notification, 'id'>) => void;
  /** Sends a 快速回應 (chip and/or sentence) on a record. Optimistic; see App.tsx. */
  setRecordResponse: (
    record: IntimateRecord,
    patch: { reaction?: MomentReactionKey | null; note?: string | null }
  ) => Promise<void>;
  partnerNickname: string;
  showRecordDetails: (recordId: number) => void;
  openDeleteConfirm: (record: IntimateRecord) => void;
  defaultRoleplayScripts: { title: string }[];
  customScripts: { title: string }[];
  togetherSince: Date | null;
  daysTogether: number;
  primaryTimezone: string;
  onNudgePartner?: () => void;
  /** Consume-once flag: opens the add-record modal once, then clears itself.
   * Lets 今天's "加一筆記錄" CTA open this modal after switching to 我們, since
   * the modal only exists inside this mounted component. */
  autoOpenAddRecord?: boolean;
  onAutoOpenAddRecordConsumed?: () => void;
}

// Calendar / record-keeping view. Defined at module scope (not inside App) so
// its identity is stable across App re-renders — a nested definition would
// remount on every render and wipe the in-progress record form. See issue #41.
const CalendarView = ({
  selectedDate,
  setSelectedDate,
  intimateRecords,
  setIntimateRecords,
  cycleRecords,
  setCycleRecords,
  authState,
  calendarMonth,
  setCalendarMonth,
  editingRecord,
  setEditingRecord,
  showRecordModal,
  setShowRecordModal,
  setSelectedRecord,
  setShowRecordDetail,
  setDayPickerDate,
  setDayPickerRecords,
  setCurrentView,
  addIntimateRecord,
  showNotification,
  setRecordResponse,
  partnerNickname,
  showRecordDetails,
  openDeleteConfirm,
  defaultRoleplayScripts,
  customScripts,
  togetherSince,
  daysTogether,
  primaryTimezone,
  onNudgePartner,
  autoOpenAddRecord,
  onAutoOpenAddRecordConsumed,
}: CalendarViewProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<'calendar' | 'timeline'>('calendar');

  const getCurrentTime = () => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // Today in the couple's primary timezone, matching the calendar's own day keys.
  const todayYmd = () => formatYmdInTz(new Date(), primaryTimezone);

  // Open the record modal pre-filled for a given day. Shared by the "記錄今天"
  // quick button and the empty-day tap on the calendar so both behave identically.
  const openAddModalForDate = (day: string) => {
    setEditingRecord(null);
    setSelectedDate(day);
    setRecordForm({ date: day, time: getCurrentTime(), mood: '💕', notes: '', description: '', duration: '', location: '', photo: '', roleplayScript: '' });
    setPeriodLengthInput('5');
    setShowRecordModal(true);
  };

  const [recordForm, setRecordForm] = useState(() => {
    if (editingRecord) {
      return {
        date: editingRecord.date,
        time: editingRecord.time,
        mood: editingRecord.mood,
        notes: editingRecord.notes || '',
        description: editingRecord.description || '',
        duration: editingRecord.duration || '',
        location: editingRecord.location || '',
        photo: editingRecord.photo || '',
        roleplayScript: editingRecord.roleplayScript || ''
      };
    }
    return {
      date: selectedDate,
      time: getCurrentTime(),
      mood: '💕',
      notes: '',
      description: '',
      duration: '',
      location: '',
      photo: '',
      roleplayScript: ''
    };
  });

  useEffect(() => {
    if (editingRecord && showRecordModal) {
      setRecordForm({
        date: editingRecord.date,
        time: editingRecord.time,
        mood: editingRecord.mood,
        notes: editingRecord.notes || '',
        description: editingRecord.description || '',
        duration: editingRecord.duration || '',
        location: editingRecord.location || '',
        photo: editingRecord.photo || '',
        roleplayScript: editingRecord.roleplayScript || ''
      });
    }
  }, [editingRecord, showRecordModal]);

  // Same consume-once pattern as EventsView's initialSubView: 今天's "加一筆記錄"
  // CTA sets this after switching to 我們, so it only fires once per request.
  useEffect(() => {
    if (autoOpenAddRecord) {
      openAddModalForDate(todayYmd());
      onAutoOpenAddRecordConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenAddRecord]);

  const recordsByDate = React.useMemo(() => {
    const map = new Map<string, IntimateRecord[]>();
    intimateRecords.forEach(r => {
      const existing = map.get(r.date) || [];
      existing.push(r);
      map.set(r.date, existing);
    });
    return map;
  }, [intimateRecords]);

  const [recordType, setRecordType] = useState<'intimacy' | 'period'>('intimacy');
  // Kept as a raw string so the field can be cleared mid-edit; clamped to 1–14
  // only on blur / submit. A controlled number value made the box impossible to
  // empty and silently clamped every keystroke to a minimum of 1.
  const [periodLengthInput, setPeriodLengthInput] = useState<string>('5');

  // Period-day management: tapping a calendar day that falls inside a logged
  // period opens this lightweight modal so the entry can be reviewed and undone.
  const [periodDayDate, setPeriodDayDate] = useState<string | null>(null);
  const [periodDayRecord, setPeriodDayRecord] = useState<CycleRecord | null>(null);
  const [deletingPeriod, setDeletingPeriod] = useState(false);
  // Both modals are `fixed inset-0`; lock the page behind them so taps inside
  // aren't offset on iOS.
  useScrollLock(showRecordModal || !!periodDayRecord);

  const cycleEnabled = !!authState.user?.cycle_tracking_enabled;
  const periodDates = React.useMemo(() => cycleEnabled ? periodDateSet(cycleRecords) : undefined, [cycleEnabled, cycleRecords]);
  const fertileDates = React.useMemo(() => cycleEnabled ? fertileDateSet(cycleRecords) : undefined, [cycleEnabled, cycleRecords]);
  const predictedPeriodDates = React.useMemo(() => cycleEnabled ? predictedPeriodDateSet(cycleRecords) : undefined, [cycleEnabled, cycleRecords]);

  // Maps every YYYY-MM-DD covered by a logged period to its CycleRecord, so a
  // tap on the calendar can find (and offer to undo) the period that owns it.
  const cycleRecordByDate = React.useMemo(() => {
    const map = new Map<string, CycleRecord>();
    for (const r of cycleRecords) {
      for (let i = 0; i < r.lengthDays; i++) {
        map.set(addDays(r.startDate, i), r);
      }
    }
    return map;
  }, [cycleRecords]);

  const handleDeletePeriod = async () => {
    if (!periodDayRecord) return;
    // No confirm() here on purpose: the modal this button lives in already IS
    // the confirmation step (it shows the record and asks 「標記錯了嗎？」), and
    // a native dialog stacked on a fixed overlay would be a second blocking
    // modal. The off-target-tap risk is handled by sizing instead — see the
    // button row below.
    setDeletingPeriod(true);
    try {
      await apiService.deleteCycleRecord(periodDayRecord.id);
      setCycleRecords(prev => prev.filter(r => r.id !== periodDayRecord.id));
      showNotification({ type: 'success', title: '已取消', message: '月經紀錄已移除', duration: 3000 });
      setPeriodDayRecord(null);
      setPeriodDayDate(null);
    } catch (error: unknown) {
      showNotification({ type: 'error', title: '移除失敗', message: (error as Error)?.message || '無法移除月經紀錄，請稍後再試', duration: 5000 });
    } finally {
      setDeletingPeriod(false);
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const compressedImage = await compressImage(file);
      setRecordForm({...recordForm, photo: compressedImage});
    } catch (err) {
      console.error('Failed to upload photo:', err);
      showNotification({
        type: 'error',
        title: '照片上傳失敗',
        message: '請稍後再試',
        duration: 3000
      });
    }
  };

  const handleSubmitRecord = async () => {
    if (!recordForm.date) {
      showNotification({ type: 'error', title: '驗證錯誤', message: '請選擇日期', duration: 6000 });
      return;
    }

    if (recordType === 'period') {
      const parsedLen = parseInt(periodLengthInput, 10);
      const lengthDays = Number.isNaN(parsedLen) ? 5 : Math.min(14, Math.max(1, parsedLen));
      try {
        const created = await apiService.createCycleRecord({
          startDate: recordForm.date,
          lengthDays,
          notes: recordForm.notes || undefined,
        });
        setCycleRecords(prev => [created, ...prev]);
        showNotification({ type: 'success', title: '已儲存', message: '週期紀錄已新增', duration: 3000 });
      } catch (error: unknown) {
        showNotification({ type: 'error', title: '建立失敗', message: (error as Error)?.message || '無法建立週期紀錄', duration: 5000 });
        return;
      }
      setShowRecordModal(false);
      setEditingRecord(null);
      setRecordType('intimacy');
      setPeriodLengthInput('5');
      return;
    }

    if (!recordForm.time) {
      showNotification({ type: 'error', title: '驗證錯誤', message: '請選擇時間', duration: 6000 });
      return;
    }

    if (editingRecord) {
      try {
        const updates: Partial<IntimateRecord> = {
          date: recordForm.date,
          time: recordForm.time,
          mood: recordForm.mood,
          notes: recordForm.notes || undefined,
          description: recordForm.description || undefined,
          duration: recordForm.duration || undefined,
          location: recordForm.location || undefined,
          roleplayScript: recordForm.roleplayScript || undefined,
        };

        // Photo change: a newly-picked photo is a base64 `data:` URL — upload it
        // and link it; an emptied field clears the photo; an unchanged URL is
        // left alone. (Previously the edit path ignored the photo entirely, so
        // "更換照片" did nothing.)
        const prevPhoto = editingRecord.photo || '';
        if (recordForm.photo !== prevPhoto) {
          if (recordForm.photo.startsWith('data:')) {
            try {
              const up = await apiService.uploadPhotoDataUrl(recordForm.photo, recordForm.description || undefined);
              updates.photo = up.url;
              updates.photoId = up.id;
            } catch (photoErr) {
              console.error('Photo upload failed:', photoErr);
              showNotification({ type: 'warning', title: '照片上傳失敗', message: '記錄已更新，但照片未能上傳，請稍後再試。', duration: 6000 });
            }
          } else if (recordForm.photo === '') {
            updates.photo = '';
            updates.photoId = ''; // '' → NULL server-side, clearing the photo
          }
        }

        await apiService.updateIntimateRecord(editingRecord.apiId!, updates);
        setIntimateRecords(prev => prev.map(r =>
          r.id === editingRecord.id ? { ...r, ...updates } : r
        ));
        showNotification({ type: 'success', title: '已更新', message: '記錄已成功更新', duration: 3000 });
      } catch (error: unknown) {
        console.error('Error updating record:', error);
        showNotification({ type: 'error', title: '更新失敗', message: (error as Error)?.message || '無法更新記錄', duration: 5000 });
        return;
      }
    } else {
      await addIntimateRecord(
        recordForm.date,
        recordForm.time,
        recordForm.mood,
        recordForm.notes || undefined,
        recordForm.photo,
        recordForm.description || undefined,
        recordForm.duration || undefined,
        recordForm.location || undefined,
        recordForm.roleplayScript || undefined
      );
    }

    setShowRecordModal(false);
    setEditingRecord(null);
    setRecordForm({
      date: selectedDate,
      time: getCurrentTime(),
      mood: '💕',
      notes: '',
      description: '',
      duration: '',
      location: '',
      photo: '',
      roleplayScript: ''
    });
  };

  // Guard against double-submit: the record-save button had no in-flight lock,
  // so a rapid double-tap created duplicate intimacy/cycle records (and coins).
  const { run: submitRecord, pending: submittingRecord } = useAsyncAction(handleSubmitRecord);

  return (
    <div className="space-y-10">
      <div className="border-b border-petal-rule pb-7">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
              — A · 記錄
            </div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05]">
                記錄<em className="not-italic font-light italic text-pink-600">時光</em>
              </h2>
              <InfoHint viewId="record" />
            </div>
            <p className="mt-3 font-body text-sm text-petal-muted leading-relaxed max-w-md">
              記下親密時光與心情，月曆會看見你們的節奏。
            </p>
          </div>
          <div className="text-left md:text-right font-body text-sm text-petal-muted leading-relaxed">
            {togetherSince ? (
              <>
                <strong className="block text-petal-ink font-display font-semibold text-base tracking-tight mb-0.5">
                  {daysTogether} days together
                </strong>
                自{formatChineseDate(togetherSince)}
              </>
            ) : (
              <span className="font-display italic">— 開始你們的旅程 —</span>
            )}
          </div>
        </div>
      </div>

      {/* Calendar/Timeline toggle — 一起走過的每一天 can be browsed as a month
          heatmap or as a chronological list; the record list below already IS a
          timeline, this just adds a way to jump between the two. */}
      <div className="inline-flex rounded-full border border-petal-rule overflow-hidden self-start" role="tablist" aria-label="檢視方式">
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'calendar'}
          data-testid="us-view-toggle-calendar"
          onClick={() => setViewMode('calendar')}
          className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium transition-colors ${
            viewMode === 'calendar' ? 'bg-petal-ink text-petal-cream' : 'bg-transparent text-petal-ink-soft hover:text-petal-ink'
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5" strokeWidth={1.5} /> Calendar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'timeline'}
          data-testid="us-view-toggle-timeline"
          onClick={() => setViewMode('timeline')}
          className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium border-l border-petal-rule transition-colors ${
            viewMode === 'timeline' ? 'bg-petal-ink text-petal-cream' : 'bg-transparent text-petal-ink-soft hover:text-petal-ink'
          }`}
        >
          <ListTree className="w-3.5 h-3.5" strokeWidth={1.5} /> Timeline
        </button>
      </div>

      {/* Calendar — the primary way to add & review records. Promoted to the top
          so the first thing after login is your shared rhythm + a one-tap add. */}
      {viewMode === 'calendar' && (
      <div>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
          <div>
            <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink">
              你們的<em className="not-italic font-light italic text-pink-600">節奏</em>
            </h3>
            <p className="mt-1 font-body text-sm text-petal-muted">點月曆任一天新增或查看紀錄</p>
          </div>
          <button
            data-testid="add-record-button"
            onClick={() => openAddModalForDate(todayYmd())}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-5 py-2.5 bg-petal-ink text-petal-cream rounded-md font-display italic text-base hover:bg-pink-700 transition-colors"
          >
            <span className="text-lg leading-none">＋</span> 記錄今天
          </button>
        </div>
        <div className="bg-white rounded-md border border-petal-rule p-5 sm:p-6">
          <CalendarHeatmap
            data={intimateRecords}
            year={calendarMonth.getFullYear()}
            month={calendarMonth.getMonth()}
            title=""
            showMonthLabels={true}
            periodDates={periodDates}
            predictedPeriodDates={predictedPeriodDates}
            fertileDates={fertileDates}
            onNavigate={(y, m) => setCalendarMonth(new Date(y, m, 1))}
            onDaySelect={(day) => {
              // A day inside a logged period opens the period-management modal
              // so it can be reviewed and undone if it was marked by mistake.
              const periodRec = cycleRecordByDate.get(day);
              if (periodRec) {
                setPeriodDayDate(day);
                setPeriodDayRecord(periodRec);
                return;
              }
              const dayRecords = recordsByDate.get(day) || [];
              if (dayRecords.length === 0) {
                // Empty day → open the add modal pre-filled for that day.
                openAddModalForDate(day);
              } else if (dayRecords.length === 1) {
                setSelectedRecord(dayRecords[0]);
                setShowRecordDetail(true);
              } else {
                setDayPickerDate(day);
                setDayPickerRecords(
                  dayRecords.slice().sort((a, b) =>
                    (b.date + 'T' + b.time).localeCompare(a.date + 'T' + a.time)
                  )
                );
              }
            }}
          />
        </div>
      </div>
      )}

      {/* Intimacy Stats — 4 cards */}
      <IntimacyStatsCards
        records={intimateRecords}
        birthDate={authState.user?.birth_date}
        onOpenSettings={() => setCurrentView('settings')}
        onNudgePartner={onNudgePartner}
        partnerConnected={authState.partnerConnected}
        showNotification={showNotification}
      />

      {/* Enhanced Record Modal */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-petal-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-petal-cream rounded-md shadow-petal max-w-2xl w-full max-h-[min(90vh,calc(100dvh-80px))] overflow-y-auto overscroll-contain border border-petal-rule">
            <div className="p-5 sm:p-6">
              <div className="flex justify-between items-end mb-5 pb-4 border-b border-petal-rule">
                <div>
                  <div className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted mb-2">
                    — {editingRecord ? '編輯記錄' : '新的記錄'}
                  </div>
                  <h3 data-testid="record-modal-heading" className="font-display text-3xl font-light tracking-tight text-petal-ink">
                    {editingRecord ? '編輯' : '記錄'}<em className="not-italic font-light italic text-pink-600">{recordType === 'period' ? '月經' : '親密時光'}</em>
                  </h3>
                </div>
                <button
                  onClick={() => { setShowRecordModal(false); setEditingRecord(null); }}
                  data-testid="record-modal-close-button"
                  className="text-petal-muted hover:text-petal-ink text-2xl font-light transition-colors leading-none"
                >
                  ×
                </button>
              </div>

              <div className="space-y-3">
                {/* Event type — only when cycle tracking is opted in and creating a new record */}
                {cycleEnabled && !editingRecord && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">事件類型</label>
                    <div className="inline-flex rounded-md border border-petal-rule overflow-hidden" role="tablist">
                      <button
                        type="button"
                        data-testid="record-type-intimacy"
                        onClick={() => setRecordType('intimacy')}
                        className={`px-4 py-2 text-sm font-display italic transition-colors ${recordType === 'intimacy' ? 'bg-petal-ink text-petal-cream' : 'bg-white text-petal-ink hover:bg-petal-cream-2'}`}
                      >親密時光</button>
                      <button
                        type="button"
                        data-testid="record-type-period"
                        onClick={() => setRecordType('period')}
                        className={`px-4 py-2 text-sm font-display italic transition-colors border-l border-petal-rule ${recordType === 'period' ? 'bg-red-500 text-white' : 'bg-white text-petal-ink hover:bg-petal-cream-2'}`}
                      >月經</button>
                    </div>
                  </div>
                )}

                {/* Basic Info */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{recordType === 'period' ? '週期開始日' : '日期選擇'}</label>
                    <CalendarDatePicker
                      selectedDate={recordForm.date}
                      onDateSelect={(date) => setRecordForm({...recordForm, date})}
                      primaryTimezone={primaryTimezone}
                    />
                  </div>
                  {recordType === 'period' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">月經天數</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={periodLengthInput}
                        onChange={(e) => {
                          // Accept only digits, keep it as a free string (incl. empty)
                          // so the field can be fully cleared; clamp on blur instead.
                          setPeriodLengthInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 2));
                        }}
                        onBlur={() => {
                          const v = parseInt(periodLengthInput, 10);
                          setPeriodLengthInput(String(Number.isNaN(v) ? 5 : Math.min(14, Math.max(1, v))));
                        }}
                        data-testid="record-period-length-input"
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                      />
                      <p className="text-xs text-petal-muted mt-1">1–14 天，預設 5 天。</p>
                    </div>
                  )}
                </div>

                {recordType !== 'period' && (
                <>
                {/* Photo Upload — compact */}
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="record-photo-upload-button"
                      className="inline-flex items-center gap-2 px-3 py-2 border border-petal-rule rounded-md text-sm text-petal-ink hover:bg-petal-cream-2 transition-colors"
                    >
                      <Camera className="w-4 h-4" />
                      {recordForm.photo ? '更換照片' : '上傳照片 (可選)'}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                    {recordForm.photo && (
                      <div className="relative">
                        <img
                          src={recordForm.photo}
                          alt="記憶照片"
                          className="w-16 h-16 object-cover rounded-md border border-petal-rule"
                        />
                        <button
                          type="button"
                          onClick={() => setRecordForm({...recordForm, photo: ''})}
                          aria-label="移除照片"
                          className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs leading-none flex items-center justify-center"
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Description and Details */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">描述你們做了什麼</label>
                  <textarea
                    value={recordForm.description}
                    onChange={(e) => setRecordForm({...recordForm, description: e.target.value})}
                    placeholder="分享這個美好時光的細節..."
                    data-testid="record-description-input"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 h-16"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <MapPin className="w-4 h-4 inline mr-2" />
                    地點
                  </label>
                  <input
                    type="text"
                    value={recordForm.location}
                    onChange={(e) => setRecordForm({...recordForm, location: e.target.value})}
                    placeholder="例如：臥室、客廳"
                    data-testid="record-location-input"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                  />
                </div>

                {/* Duration — editable so the roleplay default (15-30分鐘) can be changed */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Clock className="w-4 h-4 inline mr-2" />
                    時長 (可選)
                  </label>
                  <input
                    type="text"
                    value={recordForm.duration}
                    onChange={(e) => setRecordForm({...recordForm, duration: e.target.value})}
                    placeholder="例如：15-30分鐘"
                    data-testid="record-duration-input"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {['15-30分鐘', '30-60分鐘', '1小時以上'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setRecordForm({...recordForm, duration: preset})}
                        data-testid={`record-duration-preset-${preset}`}
                        className={`px-2.5 py-1 rounded-full border font-body text-xs transition-colors ${
                          recordForm.duration === preset
                            ? 'border-pink-500 bg-pink-50 text-pink-700'
                            : 'border-petal-rule text-petal-muted hover:border-petal-ink hover:text-petal-ink'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Roleplay Script Reference */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Play className="w-4 h-4 inline mr-2" />
                    角色扮演劇本 (可選)
                  </label>
                  <select
                    value={recordForm.roleplayScript}
                    onChange={(e) => setRecordForm({...recordForm, roleplayScript: e.target.value})}
                    data-testid="record-roleplay-select"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                  >
                    <option value="">未使用劇本</option>
                    {/* Default scripts */}
                    {defaultRoleplayScripts.map((script, index) => (
                      <option key={`default-${index}`} value={script.title}>{script.title}</option>
                    ))}
                    {/* Custom scripts */}
                    {customScripts.map((script, index) => (
                      <option key={`custom-${index}`} value={script.title}>{script.title} (自定義)</option>
                    ))}
                  </select>
                </div>

                </>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">備註</label>
                  <textarea
                    value={recordForm.notes}
                    onChange={(e) => setRecordForm({...recordForm, notes: e.target.value})}
                    placeholder="記錄這個特別時刻的感受..."
                    data-testid="record-notes-input"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 h-16"
                  />
                </div>
              </div>

              <div className="flex space-x-3 mt-6 pt-4 border-t border-petal-rule">
                <button
                  onClick={() => { setShowRecordModal(false); setEditingRecord(null); }}
                  disabled={submittingRecord}
                  data-testid="record-cancel-button"
                  className="flex-1 px-4 py-3 border border-petal-rule text-petal-ink rounded-md hover:bg-petal-cream-2 transition-colors font-body text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  取消
                </button>
                <Button
                  onClick={submitRecord}
                  loading={submittingRecord}
                  loadingText={editingRecord ? '更新中…' : '保存中…'}
                  data-testid="record-submit-button"
                  className="flex-1 px-4 py-3 text-base"
                >
                  {editingRecord ? '更新記錄' : '保存記錄'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Period-day management modal — review & undo a logged period */}
      {periodDayRecord && (
        <div className="fixed inset-0 bg-petal-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-petal-cream rounded-md shadow-petal max-w-md w-full border border-petal-rule" data-testid="period-day-modal">
            <div className="p-5 sm:p-6">
              <div className="flex justify-between items-end mb-5 pb-4 border-b border-petal-rule">
                <div>
                  <div className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted mb-2">
                    — 月經紀錄
                  </div>
                  <h3 className="font-display text-3xl font-light tracking-tight text-petal-ink">
                    這一天的<em className="not-italic font-light italic text-red-500">月經</em>
                  </h3>
                </div>
                <button
                  onClick={() => { setPeriodDayRecord(null); setPeriodDayDate(null); }}
                  data-testid="period-day-close-button"
                  className="text-petal-muted hover:text-petal-ink text-2xl font-light transition-colors leading-none"
                >
                  ×
                </button>
              </div>

              <dl className="space-y-2 font-body text-sm text-petal-ink">
                <div className="flex justify-between gap-4">
                  <dt className="text-petal-muted">所選日期</dt>
                  <dd>{periodDayDate}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-petal-muted">週期開始日</dt>
                  <dd>{periodDayRecord.startDate}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-petal-muted">天數</dt>
                  <dd>{periodDayRecord.lengthDays} 天</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-petal-muted">涵蓋區間</dt>
                  <dd>{periodDayRecord.startDate} ～ {addDays(periodDayRecord.startDate, periodDayRecord.lengthDays - 1)}</dd>
                </div>
              </dl>

              <p className="font-display italic font-light text-sm text-petal-muted mt-4">
                標記錯了嗎？可以取消這次的月經紀錄。
              </p>

              {/* 關閉 is the safe default and gets the wider share; the
                  destructive one is separated so an off-target tap on a phone
                  lands on nothing rather than on 取消這次月經. */}
              <div className="flex gap-4 mt-6 pt-4 border-t border-petal-rule">
                <button
                  onClick={() => { setPeriodDayRecord(null); setPeriodDayDate(null); }}
                  data-testid="period-day-dismiss-button"
                  className="flex-[2] px-4 py-3 min-h-[44px] border border-petal-rule text-petal-ink rounded-md hover:bg-petal-cream-2 transition-colors font-body text-sm"
                >
                  關閉
                </button>
                <button
                  onClick={handleDeletePeriod}
                  disabled={deletingPeriod}
                  data-testid="period-day-delete-button"
                  className="flex-1 px-4 py-3 min-h-[44px] bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors font-display italic text-base disabled:opacity-60"
                >
                  {deletingPeriod ? '移除中…' : '取消這次月經'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Record List — the Timeline view: it's already reverse-chronological. */}
      {viewMode === 'timeline' && (
      <div>
        <div className="flex items-baseline justify-between mb-6">
          <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink">
            親密<em className="not-italic font-light italic text-pink-600">記錄</em>
          </h3>
          <span className="font-display italic font-light text-sm text-petal-muted">
            共 <b className="not-italic font-normal text-petal-ink">{intimateRecords.length}</b> 次
          </span>
        </div>
        {/* Taller than it used to be: each row now carries a 快速回應 strip
            (~190px vs ~130px), and at 28rem only two records stayed in view. */}
        <div className="max-h-[36rem] overflow-y-auto overflow-x-hidden">
          {(() => {
            const filtered = intimateRecords
              .slice()
              .sort((a, b) => (b.date + 'T' + b.time).localeCompare(a.date + 'T' + a.time));
            return filtered.length > 0 ? filtered.map((record, idx) => {
              // filtered is sorted newest-first, so the previous intimacy is the
              // next item. Show how many days apart it was from that one.
              const prev = filtered[idx + 1];
              const gapDays = prev ? daysBetweenYmd(record.date, prev.date) : null;
              return (
              <article
                key={record.id}
                onClick={() => showRecordDetails(record.id)}
                className={`group grid grid-cols-[40px_1fr_auto] gap-5 py-5 cursor-pointer hover:bg-petal-cream-2/40 -mx-2 px-2 transition-colors ${
                  idx === 0 ? '' : 'border-t border-petal-rule-soft'
                }`}
              >
                <div className="text-base opacity-70 saturate-75 mt-1 text-center leading-none">
                  {record.mood}
                </div>
                <div className="min-w-0">
                  <div className="font-display italic font-light text-sm text-petal-muted mb-1">
                    {record.date} · {record.time}
                    {gapDays !== null && (
                      <span className="text-petal-rose-deep" data-testid="intimacy-gap-days">
                        {' '}· 距上次相隔 {gapDays} 天
                      </span>
                    )}
                  </div>
                  {record.description && (
                    <p className="font-body text-[15px] leading-relaxed text-petal-ink mb-1.5">
                      {record.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 text-[11px] text-petal-muted mt-1.5">
                    {record.duration && (
                      <span className="inline-flex items-start max-w-full px-2.5 py-0.5 border border-petal-rule rounded-md">
                        <Clock className="w-3 h-3 mr-1 mt-[3px] flex-shrink-0" />
                        <span className="break-words leading-snug">{record.duration}</span>
                      </span>
                    )}
                    {record.location && (
                      <span className="inline-flex items-start max-w-full px-2.5 py-0.5 border border-petal-rule rounded-md">
                        <MapPin className="w-3 h-3 mr-1 mt-[3px] flex-shrink-0" />
                        <span className="break-words leading-snug">{record.location}</span>
                      </span>
                    )}
                    {record.roleplayScript && (
                      <span className="inline-flex items-start max-w-full px-2.5 py-0.5 border border-petal-sage/60 bg-petal-sage/10 text-petal-sage-deep rounded-md">
                        <Play className="w-3 h-3 mr-1 mt-[3px] flex-shrink-0" />
                        <span className="break-words leading-snug">{record.roleplayScript}</span>
                      </span>
                    )}
                  </div>
                  {record.notes && (
                    <p className="font-display italic font-light text-sm text-petal-ink-soft mt-2.5 pl-3 border-l border-petal-rose-soft leading-relaxed">
                      "{record.notes}"
                    </p>
                  )}
                  {record.photo && (
                    <img
                      src={record.photo}
                      alt="記憶照片"
                      className="mt-3 w-24 h-24 rounded-md object-contain bg-petal-cream-2 border border-petal-rule"
                    />
                  )}
                  {/* One tap is all it takes to answer a record — no need to
                      open it first. The four words stop propagation so the
                      row's own onClick doesn't fire; everything else here still
                      opens the record. */}
                  <MomentResponseBar
                    record={record}
                    partnerConnected={authState.partnerConnected}
                    partnerNickname={partnerNickname}
                    variant="row"
                    onRespond={setRecordResponse}
                    timezone={primaryTimezone}
                  />
                </div>
                <div className="flex items-start pt-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); openDeleteConfirm(record); }}
                    className="opacity-0 group-hover:opacity-100 text-petal-muted hover:text-red-500 transition-all p-1 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </article>
              );
            }) : (
              <div className="border border-dashed border-petal-rule rounded-md py-10 px-6 text-center" data-testid="records-empty-state">
                <p className="font-display italic font-light text-base text-petal-muted">
                  還沒有記錄：留下的每一筆，之後都是你們的回憶
                </p>
                <p className="text-xs text-petal-ink-soft mt-2 leading-relaxed max-w-xs mx-auto">
                  記下親密時光與心情，月曆會看見你們的節奏；太久沒互動時，也會溫柔提醒彼此多關心。
                </p>
                <button
                  type="button"
                  data-testid="records-empty-add"
                  onClick={() => setShowRecordModal(true)}
                  className="mt-4 px-4 py-2 rounded-full bg-petal-rose-deep text-white text-sm font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition"
                >
                  ＋ 記下第一筆時光
                </button>
              </div>
            );
          })()}
        </div>
      </div>
      )}
    </div>
  );
};

export default CalendarView;
