// ================================================================
// ProjectTable — the list below the map. Selecting a row syncs
// with the map marker and vice versa.
// ================================================================

import React from 'react';
import {
  cx,
  fmtMw,
  fmtYear,
  statusLabel,
  CATEGORY_COLOR,
} from '../utils/format.js';
import s from '../styles/map.module.css';

export function ProjectTable({ projects, selectedId, onSelect }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th style={{ width: 24 }} />
            <th>PROJECT</th>
            <th>COMPANY</th>
            <th style={{ textAlign: 'right' }}>MW</th>
            <th>STATUS</th>
            <th>REGION</th>
            <th style={{ textAlign: 'right' }}>EXPECTED</th>
          </tr>
        </thead>
        <tbody>
          {projects.length === 0 ? (
            <tr>
              <td colSpan={7} className={s.empty}>NO PROJECTS MATCH FILTER</td>
            </tr>
          ) : (
            projects.map((p) => (
              <tr
                key={p.id}
                className={cx(s.row, selectedId === p.id && s['row--selected'])}
                onClick={() => onSelect?.(p)}
              >
                <td>
                  <span
                    className={s.rowDot}
                    style={{ background: CATEGORY_COLOR[p.category] || '#9aa0a6' }}
                  />
                </td>
                <td className={s.row__name}>{p.name}</td>
                <td className={s.row__company}>{p.company}</td>
                <td className={s.row__mw}>{fmtMw(p.powerMw)}</td>
                <td>
                  <span className={cx(s.status, s['status--' + p.status])}>
                    {statusLabel(p.status)}
                  </span>
                </td>
                <td className={s.row__region}>{regionLabel(p.region)}</td>
                <td className={s.row__year}>{fmtYear(p.expectedYear)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function regionLabel(r) {
  return (
    {
      world:       'Global',
      n_america:   'North America',
      europe:      'Europe',
      asia:        'Asia',
      middle_east: 'Middle East',
    }[r] || (r || '').replace(/_/g, ' ')
  );
}
