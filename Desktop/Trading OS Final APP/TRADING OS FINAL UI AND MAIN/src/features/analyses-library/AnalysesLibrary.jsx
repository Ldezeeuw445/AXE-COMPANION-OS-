import React, { useMemo, useState, useCallback } from "react";
import styles from "./styles/analyses.module.css";
import { useAsync } from "./hooks/useAsync";
import { TodaysThesisCard } from "./components/TodaysThesisCard";
import { SearchBar } from "./components/SearchBar";
import { TagFilters } from "./components/TagFilters";
import { AnalysesGrid } from "./components/AnalysesGrid";
import { CalendarSidebar } from "./components/CalendarSidebar";

/**
 * AnalysesLibrary — TradingView-style analysis browser.
 *
 * Layout:
 *   Row 1: TodaysThesisCard (full width)
 *   Row 2: SearchBar + TagFilters
 *   Row 3: Grid (flex) + CalendarSidebar (fixed width)
 *
 * Hovering an event in the sidebar highlights the linked analyses in the grid.
 */
export function AnalysesLibrary({ dataSource, onOpenAnalysis }) {
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState([]);
  const [hoveredEventId, setHoveredEventId] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);

  const listFn = useCallback((s) => dataSource.listAnalyses(s), [dataSource]);
  const thesisFn = useCallback((s) => dataSource.getTodaysThesis(s), [dataSource]);
  const calendarFn = useCallback(
    (s) => dataSource.listCalendar(72, s),
    [dataSource]
  );

  const { data: analyses } = useAsync(listFn, [dataSource]);
  const { data: thesis } = useAsync(thesisFn, [dataSource]);
  const { data: events } = useAsync(calendarFn, [dataSource]);

  const allAnalyses = useMemo(() => analyses || [], [analyses]);
  const allEvents = useMemo(() => events || [], [events]);

  const thesisAnalysis = useMemo(() => {
    if (!thesis || !allAnalyses.length) return null;
    return allAnalyses.find((a) => a.id === thesis.analysisId) || null;
  }, [thesis, allAnalyses]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allAnalyses.filter((a) => {
      if (tags.length && !tags.some((t) => a.tags.includes(t))) return false;
      if (!q) return true;
      if (a.title.toLowerCase().includes(q)) return true;
      if (a.summary.toLowerCase().includes(q)) return true;
      if (a.symbols.some((s) => s.toLowerCase().includes(q))) return true;
      if (a.tags.some((t) => t.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [allAnalyses, query, tags]);

  const highlightedIds = useMemo(() => {
    const ev = hoveredEventId || selectedEventId;
    if (!ev) return null;
    const event = allEvents.find((e) => e.id === ev);
    if (!event) return null;
    const out = new Set(event.linkedAnalysisIds || []);
    // also cross-link via analysis.linkedEventIds
    for (const a of allAnalyses) {
      if (a.linkedEventIds && a.linkedEventIds.includes(event.id)) out.add(a.id);
    }
    return Array.from(out);
  }, [hoveredEventId, selectedEventId, allEvents, allAnalyses]);

  const toggleTag = (tag) =>
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );

  return (
    <div className={styles.root}>
      <TodaysThesisCard
        thesis={thesis || null}
        analysis={thesisAnalysis}
        onOpen={onOpenAnalysis}
      />
      <div className={styles.controls}>
        <SearchBar value={query} onChange={setQuery} count={filtered.length} />
        <TagFilters
          active={tags}
          onToggle={toggleTag}
          onClear={() => setTags([])}
        />
      </div>
      <div className={styles.body}>
        <div className={styles.gridWrap}>
          <AnalysesGrid
            analyses={filtered}
            onOpen={onOpenAnalysis}
            highlightedIds={highlightedIds}
          />
        </div>
        <CalendarSidebar
          events={allEvents}
          hoveredEventId={hoveredEventId}
          onHoverEvent={setHoveredEventId}
          onSelectEvent={(id) =>
            setSelectedEventId((prev) => (prev === id ? null : id))
          }
          selectedEventId={selectedEventId}
        />
      </div>
    </div>
  );
}

export default AnalysesLibrary;
