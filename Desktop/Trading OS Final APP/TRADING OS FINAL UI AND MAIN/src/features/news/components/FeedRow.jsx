// ================================================================
// FeedRow — single compact row in the primary feed (memoized)
// Consumes NewsItem shape: { id, title, text, publishedAt, url,
// publisher, symbols: string[], tags: string[] }
// ================================================================

import React, { memo } from 'react';
import { hhmm, ago } from '../utils/format.js';
import s from '../styles/news.module.css';

function primaryTag(tags) {
  if (!tags || !tags.length) return '';
  return tags[0];
}

function tagClass(tag) {
  return tag === 'M&A' ? 'MA' : tag;
}

/**
 * @param {{
 *   item: import('../types.d.ts').NewsItem,
 *   index: number,
 *   isSelected: boolean,
 *   onSelect: (index: number) => void,
 *   onOpen: (url: string) => void,
 *   onSymbolClick: (sym: string) => void,
 * }} props
 */
export const FeedRow = memo(function FeedRow({
  item,
  index,
  isSelected,
  onSelect,
  onOpen,
  onSymbolClick,
}) {
  const symbols = Array.isArray(item.symbols) ? item.symbols : [];
  const symLabel = symbols[0] || '—';
  const symEmpty = !symbols.length;

  const tag = primaryTag(item.tags);
  const tc = tagClass(tag);

  function handleClick() {
    onSelect(index);
    if (symbols[0]) onSymbolClick(symbols[0].toUpperCase());
  }

  function handleDblClick() {
    if (item.url) onOpen(item.url);
  }

  const rowCls = [
    s.row,
    item._isNew  ? s['is-new']      : '',
    isSelected   ? s['is-selected'] : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={rowCls}
      onClick={handleClick}
      onDoubleClick={handleDblClick}
      data-url={item.url || ''}
      data-symbol={symbols[0] || ''}
      data-index={index}
    >
      <span className={s.row__time}>{hhmm(item.publishedAt)}</span>
      <span className={s.row__ago}>{ago(item.publishedAt)}</span>
      <span className={`${s.row__sym} ${symEmpty ? s['is-empty'] : ''}`}>{symLabel}</span>
      {tag && (
        <span className={`${s.row__tag} ${s['row__tag--' + tc] || ''}`}>{tag}</span>
      )}
      <span className={s.row__headline}>{item.title || '(no title)'}</span>
      <span className={s.row__site}>{(item.publisher || '').slice(0, 12)}</span>
    </div>
  );
});
