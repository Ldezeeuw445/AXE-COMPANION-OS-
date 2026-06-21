import React from "react";
import styles from "../styles/analyses.module.css";
import { clock, formatDay, EVENT_COLOR, untilTime } from "../utils/format";

/**
 * Right-side calendar sidebar. Events are grouped by day. Hovering/clicking
 * an event reveals which analyses are linked to it, and the parent highlights
 * matching cards in the grid.
 */
export function CalendarSidebar({
  events,
  hoveredEventId,
  onHoverEvent,
  onSelectEvent,
  selectedEventId,
}) {
  if (!events.length) {
    return (
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHead}>EVENT CALENDAR</div>
        <div className={styles.sidebarEmpty}>No upcoming events.</div>
      </aside>
    );
  }

  // group by day label
  const groups = [];
  const byLabel = new Map();
  for (const e of events) {
    const label = formatDay(e.at);
    if (!byLabel.has(label)) {
      const g = { label, items: [] };
      byLabel.set(label, g);
      groups.push(g);
    }
    byLabel.get(label).items.push(e);
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarHead}>EVENT CALENDAR</div>
      <div className={styles.sidebarList}>
        {groups.map((g) => (
          <div key={g.label} className={styles.dayGroup}>
            <div className={styles.dayLabel}>{g.label}</div>
            {g.items.map((e) => {
              const color = EVENT_COLOR[e.kind] || "#7b828a";
              const active = hoveredEventId === e.id || selectedEventId === e.id;
              const links = e.linkedAnalysisIds ? e.linkedAnalysisIds.length : 0;
              return (
                <button
                  key={e.id}
                  type="button"
                  className={styles.eventRow}
                  data-active={active ? "true" : undefined}
                  data-importance={e.importance}
                  onMouseEnter={() => onHoverEvent && onHoverEvent(e.id)}
                  onMouseLeave={() => onHoverEvent && onHoverEvent(null)}
                  onClick={() => onSelectEvent && onSelectEvent(e.id)}
                >
                  <span className={styles.eventDot} style={{ backgroundColor: color }} />
                  <span className={styles.eventTime}>{clock(e.at)}</span>
                  <span className={styles.eventTitle}>{e.title}</span>
                  <span className={styles.eventMeta}>
                    {links > 0 ? <span className={styles.eventLinks}>{links}◎</span> : null}
                    <span className={styles.eventUntil}>{untilTime(e.at)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}

export default CalendarSidebar;
