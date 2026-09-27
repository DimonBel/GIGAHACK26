import { useState } from 'react';

export const PAGE_SIZES = [10, 20, 50];

export interface Paged<T> {
  /** The rows of the current page. */
  items: T[];
  page: number;
  pages: number;
  size: number;
  total: number;
  /** 1-based positions of the first and last row shown ("21–40 of 57"). */
  from: number;
  to: number;
  setPage: (page: number) => void;
  setSize: (size: number) => void;
}

/** One page of rows. Fewer rows (a filter) never leave an empty page: the last page is shown. */
export function usePaged<T>(rows: T[], initialSize = PAGE_SIZES[1]): Paged<T> {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(initialSize);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages);
  const start = (current - 1) * size;
  return {
    items: rows.slice(start, start + size),
    page: current,
    pages,
    size,
    total: rows.length,
    from: rows.length ? start + 1 : 0,
    to: Math.min(start + size, rows.length),
    setPage,
    setSize: (next) => {
      setSize(next);
      setPage(1);
    },
  };
}
