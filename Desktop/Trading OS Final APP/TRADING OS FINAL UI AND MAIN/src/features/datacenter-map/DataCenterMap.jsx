// ================================================================
// DataCenterMap — public wrapper combining WorldMap, controls,
// and ProjectTable. Symbol-less (no per-ticker logic); the only
// selection state is the currently focused project id.
// ================================================================

import React, { useMemo, useState } from 'react';
import { useDataCenterData } from './hooks/useDataCenterData.js';
import { LeafletWorldMap } from './components/LeafletWorldMap.jsx';
import {
  MapHeader,
  RegionTabs,
  CategoryFilter,
  SearchBox,
} from './components/MapControls.jsx';
import { ProjectTable } from './components/ProjectTable.jsx';
import { cx } from './utils/format.js';
import s from './styles/map.module.css';

export function DataCenterMap({
  dataSource,
  refreshInterval = 60_000,
  defaultRegion = 'world',
  className = '',
}) {
  const { snapshot, loading, error } = useDataCenterData({ dataSource, refreshInterval });

  const [region, setRegion]         = useState(defaultRegion);
  const [category, setCategory]     = useState(null); // null = all
  const [search, setSearch]         = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const allProjects = snapshot?.projects ?? [];

  // Apply region + category + search filters
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allProjects.filter((p) => {
      if (region !== 'world' && p.region !== region) return false;
      if (category && p.category !== category) return false;
      if (q) {
        const hay = (p.name + ' ' + p.company + ' ' + (p.city || '') + ' ' + (p.countryName || ''))
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allProjects, region, category, search]);

  // Category counts for the filter bar (respect region + search, ignore category)
  const counts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = allProjects.filter((p) => {
      if (region !== 'world' && p.region !== region) return false;
      if (q) {
        const hay = (p.name + ' ' + p.company + ' ' + (p.city || '') + ' ' + (p.countryName || ''))
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const out = { all: base.length };
    for (const p of base) out[p.category] = (out[p.category] || 0) + 1;
    return out;
  }, [allProjects, region, search]);

  // Header stats from filtered set (so they respond to region)
  const stats = useMemo(() => {
    let totalMw = 0;
    let totalInvestment = 0;
    const countries = new Set();
    for (const p of filtered) {
      if (p.powerMw != null) totalMw += p.powerMw;
      if (p.investmentUsdM != null) totalInvestment += p.investmentUsdM;
      if (p.country) countries.add(p.country);
    }
    return {
      totalProjects: filtered.length,
      totalMw,
      totalInvestment,
      countries: countries.size,
    };
  }, [filtered]);

  const lastSync = useMemo(() => {
    if (!snapshot?.fetchedAt) return null;
    const d = new Date(snapshot.fetchedAt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }, [snapshot]);

  const handleSelect = (p) => {
    setSelectedId((cur) => (cur === p.id ? null : p.id));
  };

  return (
    <div className={cx(s.container, className)}>
      <MapHeader
        totalProjects={stats.totalProjects}
        totalMw={stats.totalMw}
        totalInvestment={stats.totalInvestment}
        countries={stats.countries}
        live
        lastSync={lastSync}
      />

      <div className={s.toolbar}>
        <RegionTabs region={region} onRegion={setRegion} />
        <SearchBox value={search} onChange={setSearch} />
      </div>

      <CategoryFilter value={category} onChange={setCategory} counts={counts} />

      <div className={s.mapArea}>
        {error && !snapshot ? (
          <div className={s.errorState}>{(error.message || 'FAILED').toUpperCase()}</div>
        ) : loading && !snapshot ? (
          <div className={s.loadingState}>LOADING DATA…</div>
        ) : (
          <LeafletWorldMap
            projects={filtered}
            selectedId={selectedId}
            onSelect={handleSelect}
            region={region}
          />
        )}
      </div>

      <ProjectTable
        projects={filtered}
        selectedId={selectedId}
        onSelect={handleSelect}
      />
    </div>
  );
}
