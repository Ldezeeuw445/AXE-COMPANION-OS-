// ================================================================
// QuickAlerts — 1-click alert templates + active alerts list.
// Pure presentation; state lives upstream in the parent engine.
// ================================================================

import React, { useMemo, useState } from 'react';
import { useAsync } from '../hooks/useAsync.js';
import {
  cx,
  relativeTime,
  ALERT_CATEGORY_COLOR,
  ALERT_CATEGORY_LABEL,
} from '../utils/format.js';
import s from '../styles/extras.module.css';

export function QuickAlerts({
  dataSource,
  symbol,
  refreshInterval = 45_000,
  className = '',
  variant = 'default',
}) {
  const [filter, setFilter] = useState('all'); // 'all' | AlertCategory

  const templatesQ = useAsync({
    fetcher: dataSource ? ({ signal }) => dataSource.listTemplates({ signal }) : null,
    deps: [dataSource],
  });
  const activeQ = useAsync({
    fetcher: dataSource
      ? ({ signal }) => dataSource.listActive({ symbol: symbol ?? null, signal })
      : null,
    deps: [dataSource, symbol],
    refreshInterval,
  });

  const templates = templatesQ.data || [];
  const active    = activeQ.data || [];

  const filtered = useMemo(
    () => (filter === 'all' ? templates : templates.filter((t) => t.category === filter)),
    [templates, filter],
  );

  const handleCreate = async (tpl) => {
    if (!dataSource?.createFromTemplate) return;
    try {
      await dataSource.createFromTemplate({ templateId: tpl.id, symbol: symbol ?? null });
      activeQ.refetch();
    } catch (_) { /* swallow; parent surfaces errors */ }
  };

  const handleToggle = async (alert) => {
    if (!dataSource?.toggle) return;
    try {
      await dataSource.toggle({ alertId: alert.id, enabled: !alert.enabled });
      activeQ.refetch();
    } catch (_) { /* noop */ }
  };

  const handleRemove = async (alert) => {
    if (!dataSource?.remove) return;
    try {
      await dataSource.remove({ alertId: alert.id });
      activeQ.refetch();
    } catch (_) { /* noop */ }
  };

  return (
    <div
      className={cx(
        s.panel,
        s.elevation2,
        variant === 'sidebar' && s.panelSidebar,
        className,
      )}
    >
      <div className={s.panel__head}>
        <span className="tos-block-title">1-CLICK ALERTS</span>
        <span className={cx(s.mono, s.muted)}>{symbol || 'GLOBAL'}</span>
      </div>

      <CategoryStrip
        active={filter}
        onChange={setFilter}
        counts={templateCounts(templates)}
      />

      <div className={s.templateList}>
        {templatesQ.loading && !templates.length ? (
          <Skel rows={5} height={38} />
        ) : templatesQ.error ? (
          <div className={s.error}>TEMPLATES FAILED</div>
        ) : filtered.length === 0 ? (
          <div className={s.empty}>NO TEMPLATES</div>
        ) : (
          filtered.map((tpl) => (
            <TemplateRow key={tpl.id} tpl={tpl} onCreate={handleCreate} />
          ))
        )}
      </div>

      <div className={s.sectionHead}>
        <span>ACTIVE ALERTS</span>
        <span className={cx(s.mono, s.muted)}>{active.length}</span>
      </div>
      <div className={s.activeList}>
        {activeQ.loading && !active.length ? (
          <Skel rows={2} height={28} />
        ) : activeQ.error ? (
          <div className={s.error}>ACTIVE LIST FAILED</div>
        ) : active.length === 0 ? (
          <div className={s.empty}>NO ACTIVE ALERTS</div>
        ) : (
          active.map((a) => (
            <ActiveRow key={a.id} alert={a} onToggle={handleToggle} onRemove={handleRemove} />
          ))
        )}
      </div>
    </div>
  );
}

function templateCounts(templates) {
  const out = { all: templates.length };
  for (const t of templates) out[t.category] = (out[t.category] || 0) + 1;
  return out;
}

function CategoryStrip({ active, onChange, counts }) {
  const items = [
    { key: 'all',            label: 'ALL' },
    { key: 'price',          label: 'PRICE' },
    { key: 'technical',      label: 'TECH' },
    { key: 'volume',         label: 'VOL' },
    { key: 'short_interest', label: 'SHORT' },
    { key: 'options',        label: 'OPT' },
    { key: 'news',           label: 'NEWS' },
    { key: 'macro',          label: 'MACRO' },
  ];
  return (
    <div className={s.chipRow}>
      {items.map((c) => (
        <button
          key={c.key}
          type="button"
          className={cx(s.chip, active === c.key && s['chip--active'])}
          onClick={() => onChange(c.key)}
        >
          <span
            className={s.chipDot}
            style={{
              background:
                c.key === 'all'
                  ? 'linear-gradient(135deg, #4ea1ff, #1fbf75, #f5a524)'
                  : ALERT_CATEGORY_COLOR[c.key] || '#9aa0a6',
            }}
          />
          {c.label}
          <span className={s.chipCount}>{counts?.[c.key] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

function TemplateRow({ tpl, onCreate }) {
  return (
    <div className={s.template} onClick={() => onCreate(tpl)} role="button" tabIndex={0}>
      <span
        className={s.templateDot}
        style={{ background: ALERT_CATEGORY_COLOR[tpl.category] || '#9aa0a6' }}
      />
      <div className={s.templateText}>
        <div className={s.templateTitleRow}>
          <span className={s.templateTitle}>{tpl.title}</span>
          {tpl.badge && <span className={s.badge}>{tpl.badge}</span>}
        </div>
        <div className={s.templateSub}>
          <span className={cx(s.mono, s.muted)}>
            {ALERT_CATEGORY_LABEL[tpl.category] || tpl.category.toUpperCase()}
          </span>
          {tpl.paramSummary && (
            <>
              <span className={s.sep}>·</span>
              <span className={cx(s.mono, s.muted)}>{tpl.paramSummary}</span>
            </>
          )}
        </div>
      </div>
      <span className={s.addBtn} aria-hidden>+</span>
    </div>
  );
}

function ActiveRow({ alert, onToggle, onRemove }) {
  return (
    <div className={cx(s.active, !alert.enabled && s['active--off'])}>
      <button
        type="button"
        className={cx(s.toggle, alert.enabled && s['toggle--on'])}
        onClick={() => onToggle(alert)}
        aria-label={alert.enabled ? 'Disable alert' : 'Enable alert'}
      >
        <span className={s.toggleKnob} />
      </button>
      <div className={s.activeText}>
        <div className={s.activeTitle}>{alert.title}</div>
        <div className={s.activeDetail}>
          <span className={cx(s.mono, s.muted)}>{alert.detail}</span>
          {alert.lastTriggeredAt && (
            <>
              <span className={s.sep}>·</span>
              <span className={cx(s.mono, s.muted)}>
                fired {relativeTime(alert.lastTriggeredAt)}
              </span>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        className={s.removeBtn}
        onClick={() => onRemove(alert)}
        aria-label="Remove alert"
      >
        ×
      </button>
    </div>
  );
}

function Skel({ rows = 4, height = 32 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={s.skel} style={{ height }} />
      ))}
    </div>
  );
}
