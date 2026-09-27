import { Group, Pagination, Select, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

import { PAGE_SIZES, type Paged } from '../hooks/usePaged';

/** "21–40 of 57", rows per page and the pages; hidden while every row fits on the smallest page. */
export function TablePagination<T>({ paged }: { paged: Paged<T> }) {
  const { t } = useTranslation();
  if (paged.total <= PAGE_SIZES[0]) return null;
  return (
    <Group justify="space-between" gap="sm" mt="md" className="no-print">
      <Text size="sm" c="dimmed">
        {t('pagination.range', { from: paged.from, to: paged.to, total: paged.total })}
      </Text>
      <Group gap="sm">
        <Select
          size="xs"
          w={76}
          data={PAGE_SIZES.map(String)}
          value={String(paged.size)}
          onChange={(value) => value && paged.setSize(Number(value))}
          allowDeselect={false}
          aria-label={t('pagination.perPage')}
        />
        {paged.pages > 1 && (
          <Pagination
            size="sm"
            total={paged.pages}
            value={paged.page}
            onChange={paged.setPage}
            getControlProps={() => ({ 'aria-label': t('pagination.pages') })}
          />
        )}
      </Group>
    </Group>
  );
}
