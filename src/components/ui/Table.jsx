import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import Input from './Input';
import Button from './Button';
import Skeleton from './Skeleton';

const Table = ({
  data = [],
  columns = [],
  loading = false,
  searchable = false,
  searchPlaceholder = 'ค้นหา...',
  searchKeys = [],
  sortable = true,
  pagination = false,
  pageSize = 10,
  emptyMessage = 'ไม่พบข้อมูล',
  onRowClick,
  rowClassName,
  className = '',
  striped = false,
  hoverable = true,
  compact = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);

  // Filter data based on search
  const filteredData = useMemo(() => {
    if (!searchTerm) return data;

    const keys = searchKeys.length > 0 ? searchKeys : columns.map(c => c.key);

    return data.filter(item =>
      keys.some(key => {
        const value = item[key];
        if (value == null) return false;
        return String(value).toLowerCase().includes(searchTerm.toLowerCase());
      })
    );
  }, [data, searchTerm, searchKeys, columns]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const comparison = String(aVal).localeCompare(String(bVal), 'th');
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredData, sortConfig]);

  // Paginate data
  const paginatedData = useMemo(() => {
    if (!pagination) return sortedData;

    const startIndex = (currentPage - 1) * pageSize;
    return sortedData.slice(startIndex, startIndex + pageSize);
  }, [sortedData, currentPage, pageSize, pagination]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  // Handle sort
  const handleSort = (key) => {
    if (!sortable) return;

    const column = columns.find(c => c.key === key);
    if (column?.sortable === false) return;

    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Reset to page 1 when search changes
  useMemo(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const cellPadding = compact ? 'px-3 py-2' : 'px-4 py-3';

  return (
    <div className={className}>
      {/* Search */}
      {searchable && (
        <div className="mb-4">
          <Input
            type="text"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search size={18} />}
            size="sm"
            className="max-w-xs"
          />
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full">
          {/* Header */}
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  onClick={() => column.sortable !== false && handleSort(column.key)}
                  className={`
                    ${cellPadding}
                    text-left text-xs font-semibold uppercase tracking-wider
                    text-gray-500 dark:text-gray-400
                    ${column.sortable !== false && sortable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700' : ''}
                    ${column.align === 'right' ? 'text-right' : ''}
                    ${column.align === 'center' ? 'text-center' : ''}
                    ${column.width ? `w-[${column.width}]` : ''}
                  `}
                  style={column.width ? { width: column.width } : undefined}
                >
                  <div className={`flex items-center gap-1 ${column.align === 'right' ? 'justify-end' : ''}`}>
                    {column.label}
                    {sortable && column.sortable !== false && sortConfig.key === column.key && (
                      <span className="text-emerald-500">
                        {sortConfig.direction === 'asc' ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* Body */}
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {loading ? (
              // Loading skeleton
              Array.from({ length: pageSize }).map((_, i) => (
                <tr key={i}>
                  {columns.map((column) => (
                    <td key={column.key} className={cellPadding}>
                      <Skeleton height="1rem" rounded="md" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginatedData.length === 0 ? (
              // Empty state
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              // Data rows
              <AnimatePresence mode="popLayout">
                {paginatedData.map((row, index) => (
                  <motion.tr
                    key={row.id || index}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => onRowClick?.(row)}
                    className={`
                      bg-white dark:bg-gray-900
                      ${striped && index % 2 === 1 ? 'bg-gray-50 dark:bg-gray-800/50' : ''}
                      ${hoverable ? 'hover:bg-gray-50 dark:hover:bg-gray-800' : ''}
                      ${onRowClick ? 'cursor-pointer' : ''}
                      ${typeof rowClassName === 'function' ? rowClassName(row) : rowClassName || ''}
                    `}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={`
                          ${cellPadding}
                          text-sm text-gray-700 dark:text-gray-300
                          ${column.align === 'right' ? 'text-right' : ''}
                          ${column.align === 'center' ? 'text-center' : ''}
                        `}
                      >
                        {column.render
                          ? column.render(row[column.key], row)
                          : row[column.key]}
                      </td>
                    ))}
                  </motion.tr>
                ))}
              </AnimatePresence>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            แสดง {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, sortedData.length)} จาก {sortedData.length} รายการ
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              leftIcon={<ChevronLeft size={16} />}
            >
              ก่อนหน้า
            </Button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`
                      w-8 h-8 rounded-lg text-sm font-medium transition-colors
                      ${pageNum === currentPage
                        ? 'bg-emerald-500 text-white'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }
                    `}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              rightIcon={<ChevronRight size={16} />}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Table;
