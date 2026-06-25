// ================================================================
// MapControls — header with stats, region tabs, category filters,
// and search. Pure presentation; state is lifted to the parent.
// ================================================================

import React from 'react';
import { cx, fmtInt, fmtMw, fmtUsd, categoryLabel, CATEGORY_COLOR } from '../utils/format.js';
import s from '../styles/map.module.css';

const REGIONS = [
  { key: 'world',       label: 'WORLD' },
  { key: 'n_america',   label: 'N.AMERICA' },
  { key: 'europe',      label: 'EUROPE' },
  { key: 'asia',        label: 'ASIA' },
  { key: 'middle_east', label: 'MIDDLE EAST' },
];

const CATEGORIES = ['stargate', 'hyperscaler', 'neocloud', 'sovereign', 'independent'];

export function MapHeader({ totalProjects, totalMw, totalInvestment, countries, live = true, lastSync }) {
  return (
    <div className={s.header}>
      <div className={s.header__brand}>
        <span className={s.dot} />
        <span className={s.header__title}>AI DATA CENTER TRACKER</span>
        {live && (
          <span className={s.live}>
            <span className={s.live__dot} />
            LIVE
          </span>
        )}
      </div>
      <div className={s.header__stats}>
        <Stat label="PROJECTS"   value={fmtInt(totalProjects)} />
        <Stat label="GW CAPACITY" value={fmtMw(totalMw)} accent />
        <Stat label="INVESTMENT" value={fmtUsd(totalInvestment)} accent />
        <Stat label="COUNTRIES"  value={fmtInt(countries)} />
      </div>
      <div className={s.header__sync}>
        {lastSync ? <>SYNCED {lastSync}</> : <>—</>}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className={s.stat}>
      <span className={cx(s.stat__value, accent && s['stat__value--accent'])}>{value}</span>
      <span className={s.stat__label}>{label}</span>
    </div>
  );
}

export function RegionTabs({ region, onRegion }) {
  return (
    <div className={s.tabs}>
      {REGIONS.map((r) => (
        <button
          key={r.key}
          type="button"
          className={cx(s.tab, region === r.key && s['tab--active'])}
          onClick={() => onRegion?.(r.key)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

export function CategoryFilter({ value, onChange, counts }) {
  const active = value || 'all';
  return (
    <div className={s.filters}>
      <button
        type="button"
        className={cx(s.filter, active === 'all' && s['filter--active'])}
        onClick={() => onChange?.(null)}
      >
        <span className={cx(s.filter__dot, s['filter__dot--all'])} />
        ALL <span className={s.filter__count}>{counts?.all ?? 0}</span>
      </button>
      {CATEGORIES.map((c) => (
        <button
          key={c}
          type="button"
          className={cx(s.filter, active === c && s['filter--active'])}
          onClick={() => onChange?.(c)}
        >
          <span className={s.filter__dot} style={{ background: CATEGORY_COLOR[c] }} />
          {categoryLabel(c)}
          <span className={s.filter__count}>{counts?.[c] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange }) {
  return (
    <div className={s.search}>
      <input
        type="text"
        placeholder="Search projects..."
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        className={s.search__input}
      />
    </div>
  );
}
