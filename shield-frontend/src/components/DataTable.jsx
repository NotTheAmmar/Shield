import React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

function SortIcon({ column, sortBy, sortOrder }) {
  if (sortBy !== column) return <ChevronsUpDown size={12} style={{ opacity: 0.4 }} />;
  return sortOrder === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
}

export default function DataTable({
  columns,     // [{ key, label, sortable?, render?, className? }]
  data,
  rowKey = 'id',
  loading = false,
  emptyMessage = 'No records found.',
  page = 1,
  totalPages = 1,
  total = 0,
  limit = 25,
  sortBy,
  sortOrder,
  onSort,
  onPageChange,
  rowClassName,
}) {
  // Defensively normalize: accept array, object-with-.data, or null/undefined
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
    ? data.data
    : [];

  const handleSort = (col) => {
    if (!col.sortable || !onSort) return;
    if (sortBy === col.key) {
      onSort(col.key, sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      onSort(col.key, 'asc');
    }
  };

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div>
      <div className="table-wrapper" data-testid="data-table">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${col.sortable ? 'sortable' : ''} ${col.thClassName || ''}`}
                  onClick={() => handleSort(col)}
                >
                  <span className="th-inner">
                    {col.label}
                    {col.sortable && (
                      <SortIcon column={col.key} sortBy={sortBy} sortOrder={sortOrder} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '40px' }}>
                  <span className="spinner" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <div className="table-empty">
                    <div className="table-empty-icon">📭</div>
                    <div className="table-empty-text">{emptyMessage}</div>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row[rowKey]}
                  className={rowClassName ? rowClassName(row) : ''}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={col.className || ''}>
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!loading && rows.length > 0 && (
          <div className="table-footer">
            <span>
              {total > 0
                ? `Showing ${start}–${end} of ${total} records`
                : `${data.length} records`}
            </span>
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="pagination-btn"
                  disabled={page <= 1}
                  onClick={() => onPageChange?.(page - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p;
                  if (totalPages <= 7) p = i + 1;
                  else if (page <= 4) p = i + 1;
                  else if (page >= totalPages - 3) p = totalPages - 6 + i;
                  else p = page - 3 + i;
                  return (
                    <button
                      key={p}
                      className={`pagination-btn ${p === page ? 'active' : ''}`}
                      onClick={() => onPageChange?.(p)}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  className="pagination-btn"
                  disabled={page >= totalPages}
                  onClick={() => onPageChange?.(page + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
