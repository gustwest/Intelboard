'use client';

import React, { useState, useEffect } from 'react';
import { useAuth, DEMO_USERS, getDemoAvatar } from '@/contexts/AuthContext';
import StarRating from '@/components/StarRating';
import styles from './EventsTab.module.css';

interface EventItem {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  authorName: string;
  attendees: string[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function EventsTab({ categoryId, categoryName }: { categoryId: string; categoryName: string }) {
  const { user, signInAsDemo } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', description: '', date: '', time: '14:00' });

  useEffect(() => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    setEvents([
      {
        id: '1',
        title: `${categoryName} Weekly Discussion`,
        description: `Regular weekly discussion about recent developments and questions in ${categoryName}.`,
        date: tomorrow.toISOString().split('T')[0],
        time: '15:00',
        authorName: 'Community Organizer',
        attendees: ['user1', 'user2', 'user3'],
      },
      {
        id: '2',
        title: `${categoryName} Study Group`,
        description: `Collaborative study session for anyone interested in deepening their understanding.`,
        date: nextWeek.toISOString().split('T')[0],
        time: '18:00',
        authorName: 'Study Leader',
        attendees: ['user4', 'user5'],
      },
    ]);
  }, [categoryId, categoryName]);

  function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
  }

  function getFirstDayOfMonth(year: number, month: number): number {
    return new Date(year, month, 1).getDay();
  }

  function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days: React.ReactNode[] = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className={styles.dayEmpty}></div>);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvents = events.filter(e => e.date === dateStr);
      const isToday = new Date().toISOString().split('T')[0] === dateStr;
      const isSelected = selectedDate === dateStr;

      days.push(
        <button
          key={d}
          className={`${styles.day} ${isToday ? styles.today : ''} ${isSelected ? styles.selected : ''} ${dayEvents.length > 0 ? styles.hasEvents : ''}`}
          onClick={() => setSelectedDate(dateStr)}
        >
          <span className={styles.dayNum}>{d}</span>
          {dayEvents.length > 0 && <span className={styles.eventDot}></span>}
        </button>
      );
    }

    return days;
  }

  function handleCreateEvent() {
    if (!form.title.trim() || !form.date) return;
    const event: EventItem = {
      id: Date.now().toString(),
      ...form,
      authorName: user?.displayName || 'Anonymous',
      attendees: [],
    };
    setEvents([...events, event]);
    setForm({ title: '', description: '', date: '', time: '14:00' });
    setShowModal(false);
  }

  const selectedEvents = selectedDate ? events.filter(e => e.date === selectedDate) : [];
  const upcomingEvents = events
    .filter(e => new Date(e.date) >= new Date(new Date().toISOString().split('T')[0]))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className={styles.container}>
      <div className={styles.eventsHeader}>
        <h2 className={styles.eventsTitle}>📅 Events & Calendar</h2>
        {user ? (
          <button className="btn-primary" onClick={() => setShowModal(true)}>+ Create Event</button>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {DEMO_USERS.map(u => (
              <button key={u.uid} className="btn-primary" onClick={() => signInAsDemo(u.uid)} style={{ fontSize: 'var(--text-xs)' }}>
                {getDemoAvatar(u.uid)} {u.displayName?.split(' ')[0]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.layout}>
        {/* Calendar */}
        <div className={styles.calendarSection}>
          <div className={styles.calendarNav}>
            <button className="btn-ghost" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}>
              ←
            </button>
            <h3 className={styles.calendarMonth}>
              {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h3>
            <button className="btn-ghost" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}>
              →
            </button>
          </div>
          <div className={styles.calendarGrid}>
            {DAYS.map(day => (
              <div key={day} className={styles.dayHeader}>{day}</div>
            ))}
            {renderCalendar()}
          </div>
        </div>

        {/* Events List */}
        <div className={styles.eventsSection}>
          {selectedDate ? (
            <>
              <h3 className={styles.eventsSectionTitle}>
                Events on {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
              </h3>
              {selectedEvents.length > 0 ? (
                selectedEvents.map(event => (
                  <div key={event.id} className={styles.eventCard}>
                    <div className={styles.eventTime}>{event.time}</div>
                    <div className={styles.eventInfo}>
                      <h4 className={styles.eventName}>{event.title}</h4>
                      <p className={styles.eventDesc}>{event.description}</p>
                      <div className={styles.eventMeta}>
                        <span>By {event.authorName}</span>
                        <span>{event.attendees.length} attending</span>
                      </div>
                      <StarRating targetType="event" targetId={event.id} size="sm" />
                    </div>
                  </div>
                ))
              ) : (
                <p className={styles.noEvents}>No events on this date</p>
              )}
            </>
          ) : (
            <>
              <h3 className={styles.eventsSectionTitle}>Upcoming Events</h3>
              {upcomingEvents.length > 0 ? (
                upcomingEvents.map(event => (
                  <div key={event.id} className={styles.eventCard}>
                    <div className={styles.eventDate}>
                      <span className={styles.eventDateDay}>{new Date(event.date + 'T00:00:00').getDate()}</span>
                      <span className={styles.eventDateMonth}>{MONTHS[new Date(event.date + 'T00:00:00').getMonth()].slice(0, 3)}</span>
                    </div>
                    <div className={styles.eventInfo}>
                      <h4 className={styles.eventName}>{event.title}</h4>
                      <p className={styles.eventDesc}>{event.description}</p>
                      <div className={styles.eventMeta}>
                        <span>🕐 {event.time}</span>
                        <span>👥 {event.attendees.length} attending</span>
                      </div>
                      <StarRating targetType="event" targetId={event.id} size="sm" />
                    </div>
                  </div>
                ))
              ) : (
                <p className={styles.noEvents}>No upcoming events. Click a date to view or create a new event.</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create Event Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: '1.5rem' }}>Create Event</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input
                className="input"
                placeholder="Event title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <textarea
                className="textarea"
                placeholder="Event description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
              <div style={{ display: 'flex', gap: '1rem' }}>
                <input
                  type="date"
                  className="input"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
                <input
                  type="time"
                  className="input"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleCreateEvent}>Create Event</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
