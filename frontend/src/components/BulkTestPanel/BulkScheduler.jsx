import { useState } from 'react';
import styles from './BulkScheduler.module.css';

export default function BulkScheduler({ onSchedule, onClose, selectedItems }) {
  const [scheduleConfig, setScheduleConfig] = useState({
    name: '',
    type: 'once', // 'once', 'daily', 'weekly', 'monthly'
    datetime: '',
    time: '',
    daysOfWeek: [],
    dayOfMonth: 1,
    enabled: true,
  });

  const handleSubmit = e => {
    e.preventDefault();

    if (!scheduleConfig.name.trim()) {
      alert('Please enter a schedule name');
      return;
    }

    if (scheduleConfig.type === 'once' && !scheduleConfig.datetime) {
      alert('Please select date and time for one-time execution');
      return;
    }

    if (scheduleConfig.type === 'daily' && !scheduleConfig.time) {
      alert('Please select time for daily execution');
      return;
    }

    onSchedule(scheduleConfig);
  };

  const handleDayOfWeekChange = day => {
    setScheduleConfig(prev => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day)
        ? prev.daysOfWeek.filter(d => d !== day)
        : [...prev.daysOfWeek, day],
    }));
  };

  const daysOfWeek = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>📅 Schedule Bulk Tests</h3>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalContent}>
          {/* Schedule Name */}
          <div className={styles.formGroup}>
            <label htmlFor="scheduleName">Schedule Name *</label>
            <input
              type="text"
              id="scheduleName"
              value={scheduleConfig.name}
              onChange={e =>
                setScheduleConfig(prev => ({ ...prev, name: e.target.value }))
              }
              placeholder="e.g., Daily API Health Check"
              required
            />
          </div>

          {/* Selected Items Summary */}
          <div className={styles.formGroup}>
            <label>Selected Items</label>
            <div className={styles.selectedSummary}>
              {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''}{' '}
              selected for bulk testing
            </div>
          </div>

          {/* Schedule Type */}
          <div className={styles.formGroup}>
            <label htmlFor="scheduleType">Schedule Type *</label>
            <select
              id="scheduleType"
              value={scheduleConfig.type}
              onChange={e =>
                setScheduleConfig(prev => ({ ...prev, type: e.target.value }))
              }
              required
            >
              <option value="once">Run Once</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {/* One-time execution */}
          {scheduleConfig.type === 'once' && (
            <div className={styles.formGroup}>
              <label htmlFor="datetime">Date & Time *</label>
              <input
                type="datetime-local"
                id="datetime"
                value={scheduleConfig.datetime}
                onChange={e =>
                  setScheduleConfig(prev => ({
                    ...prev,
                    datetime: e.target.value,
                  }))
                }
                min={new Date().toISOString().slice(0, 16)}
                required
              />
            </div>
          )}

          {/* Daily execution */}
          {scheduleConfig.type === 'daily' && (
            <div className={styles.formGroup}>
              <label htmlFor="time">Time *</label>
              <input
                type="time"
                id="time"
                value={scheduleConfig.time}
                onChange={e =>
                  setScheduleConfig(prev => ({ ...prev, time: e.target.value }))
                }
                required
              />
            </div>
          )}

          {/* Weekly execution */}
          {scheduleConfig.type === 'weekly' && (
            <>
              <div className={styles.formGroup}>
                <label htmlFor="weeklyTime">Time *</label>
                <input
                  type="time"
                  id="weeklyTime"
                  value={scheduleConfig.time}
                  onChange={e =>
                    setScheduleConfig(prev => ({
                      ...prev,
                      time: e.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label>Days of Week *</label>
                <div className={styles.daysOfWeek}>
                  {daysOfWeek.map(day => (
                    <label key={day} className={styles.dayCheckbox}>
                      <input
                        type="checkbox"
                        checked={scheduleConfig.daysOfWeek.includes(day)}
                        onChange={() => handleDayOfWeekChange(day)}
                      />
                      <span>{day.slice(0, 3)}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Monthly execution */}
          {scheduleConfig.type === 'monthly' && (
            <>
              <div className={styles.formGroup}>
                <label htmlFor="monthlyTime">Time *</label>
                <input
                  type="time"
                  id="monthlyTime"
                  value={scheduleConfig.time}
                  onChange={e =>
                    setScheduleConfig(prev => ({
                      ...prev,
                      time: e.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="dayOfMonth">Day of Month *</label>
                <select
                  id="dayOfMonth"
                  value={scheduleConfig.dayOfMonth}
                  onChange={e =>
                    setScheduleConfig(prev => ({
                      ...prev,
                      dayOfMonth: parseInt(e.target.value),
                    }))
                  }
                  required
                >
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Enabled Toggle */}
          <div className={styles.formGroup}>
            <label className={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={scheduleConfig.enabled}
                onChange={e =>
                  setScheduleConfig(prev => ({
                    ...prev,
                    enabled: e.target.checked,
                  }))
                }
              />
              <span>Enable schedule immediately</span>
            </label>
          </div>

          {/* Actions */}
          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className={styles.scheduleButton}>
              Create Schedule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
