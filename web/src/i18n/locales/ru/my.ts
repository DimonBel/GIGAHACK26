import type { Messages } from '../../types';
import type en from '../en/my';

const my: Messages<typeof en> = {
  title: 'Мои протоколы',
  description: 'Протоколы совещаний, которые вам отправили.',
  emptyTitle: 'Пока ничего нет',
  emptyDescription: 'Протоколы появятся здесь, когда модератор отправит их вам.',
  untitled: 'Протокол совещания',
  open: 'Открыть протокол: {{title}}',
  sent: 'Отправлено {{date}}, отправитель: {{name}}',
  minutes: 'Протокол',
  search: 'Поиск по названию',
  noMatch: 'Нет подходящих протоколов.',
};

export default my;
