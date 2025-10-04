import { useState } from 'react';
import styles from './BulkScheduler.module.css';

export default function BulkScheduler({
  onSchedule,
  onClose,
  selectedItems,
  existingSchedule = null,
  isEditing = false,
}) {
  // Initialize state with existing schedule data if editing
  const [scheduleConfig, setScheduleConfig] = useState(() => {
    if (isEditing && existingSchedule) {
      return {
        name: existingSchedule.name || '',
        type: existingSchedule.type || 'once',
        datetime: existingSchedule.date_time
          ? new Date(existingSchedule.date_time).toISOString().slice(0, 16)
          : '',
        time: existingSchedule.time || '',
        daysOfWeek: existingSchedule.days_of_week || [],
        dayOfMonth: existingSchedule.day_of_month || 1,
        intervalCount: existingSchedule.interval_count || 20,
        enabled:
          existingSchedule.enabled !== undefined
            ? existingSchedule.enabled
            : true,
      };
    }
    return {
      name: '',
      type: 'once',
      datetime: '',
      time: '',
      daysOfWeek: [],
      dayOfMonth: 1,
      intervalCount: 20,
      enabled: true,
    };
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

    if (scheduleConfig.type === 'minutely' && !scheduleConfig.intervalCount) {
      alert('Please select interval for minutely execution');
      return;
    }

    if (scheduleConfig.type === 'hourly' && !scheduleConfig.time) {
      alert('Please select minute for hourly execution');
      return;
    }

    onSchedule(scheduleConfig);
    console.log('BulkScheduler submitting config:', scheduleConfig);
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
          <h3>{isEditing ? '✏️ Edit Schedule' : '📅 Schedule Bulk Tests'}</h3>
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
              <option value="minutely">Every Minute</option>
              <option value="hourly">Hourly</option>
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

          {/* Minutely execution */}
          {scheduleConfig.type === 'minutely' && (
            <div className={styles.formGroup}>
              <label htmlFor="minuteInterval">Run every X minutes *</label>
              <div className={styles.intervalInputGroup}>
                <input
                  type="number"
                  id="minuteInterval"
                  value={scheduleConfig.intervalCount}
                  onChange={e =>
                    setScheduleConfig(prev => ({
                      ...prev,
                      intervalCount: Math.max(
                        20,
                        parseInt(e.target.value) || 20
                      ),
                    }))
                  }
                  min="20"
                  max="1440"
                  step="5"
                  required
                />
                <span className={styles.intervalUnit}>minutes</span>
              </div>
              <div className={styles.quickOptions}>
                <span>Quick options:</span>
                {[20, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720].map(
                  value => (
                    <button
                      key={value}
                      type="button"
                      className={`${styles.quickOption} ${scheduleConfig.intervalCount === value ? styles.active : ''}`}
                      onClick={() =>
                        setScheduleConfig(prev => ({
                          ...prev,
                          intervalCount: value,
                        }))
                      }
                    >
                      {value < 60 ? `${value}m` : `${value / 60}h`}
                    </button>
                  )
                )}
              </div>
              <p className={styles.scheduleHint}>
                Minimum 20 minutes. Tests will run automatically at the
                specified interval.
              </p>
            </div>
          )}

          {/* Hourly execution */}
          {scheduleConfig.type === 'hourly' && (
            <>
              <div className={styles.formGroup}>
                <label htmlFor="hourlyInterval">Run every X hours *</label>
                <div className={styles.intervalInputGroup}>
                  <input
                    type="number"
                    id="hourlyInterval"
                    value={scheduleConfig.intervalCount}
                    onChange={e =>
                      setScheduleConfig(prev => ({
                        ...prev,
                        intervalCount: Math.max(
                          1,
                          parseInt(e.target.value) || 1
                        ),
                      }))
                    }
                    min="1"
                    max="24"
                    step="1"
                    required
                  />
                  <span className={styles.intervalUnit}>hours</span>
                </div>
                <div className={styles.quickOptions}>
                  <span>Quick options:</span>
                  {[1, 2, 3, 4, 6, 8, 12, 18, 24].map(value => (
                    <button
                      key={value}
                      type="button"
                      className={`${styles.quickOption} ${scheduleConfig.intervalCount === value ? styles.active : ''}`}
                      onClick={() =>
                        setScheduleConfig(prev => ({
                          ...prev,
                          intervalCount: value,
                        }))
                      }
                    >
                      {value}h
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="hourlyMinute">Minute of Hour *</label>
                <select
                  id="hourlyMinute"
                  value={
                    scheduleConfig.time
                      ? scheduleConfig.time.split(':')[1]
                      : '00'
                  }
                  onChange={e =>
                    setScheduleConfig(prev => ({
                      ...prev,
                      time: `00:${e.target.value}`,
                    }))
                  }
                  required
                >
                  {Array.from({ length: 60 }, (_, i) => (
                    <option key={i} value={i.toString().padStart(2, '0')}>
                      :{i.toString().padStart(2, '0')} (minute {i})
                    </option>
                  ))}
                </select>
                <p className={styles.scheduleHint}>
                  Tests will run at this minute of every{' '}
                  {scheduleConfig.intervalCount} hour(s)
                </p>
              </div>
            </>
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
              {isEditing ? 'Update Schedule' : 'Create Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
