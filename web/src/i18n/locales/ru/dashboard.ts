import type { Messages } from '../../types';
import type en from '../en/dashboard';

const dashboard: Messages<typeof en> = {
  greeting: {
    morning: 'Доброе утро, {{name}}',
    afternoon: 'Добрый день, {{name}}',
    evening: 'Добрый вечер, {{name}}',
  },
  stats: {
    drafts: 'Совещания на проверку',
    inProgress: 'В обработке',
    toSend: 'Утверждены, не отправлены',
    sent: 'Отправлены',
  },
  attention: {
    title: 'Требует вашего внимания',
    empty: 'Ничего не ждёт вашего внимания.',
    ready: 'Проверьте и утвердите протокол',
    approved: 'Выберите получателей и отправьте',
    failed: 'Обработка не удалась: загрузите запись снова',
  },
  recent: {
    title: 'Недавние совещания',
    all: 'Все совещания',
    empty: 'Совещаний пока нет. Загрузите или запишите первое.',
  },
  admin: {
    title: 'Администрирование',
    activeUsers_one: '{{count}} активный пользователь',
    activeUsers_few: '{{count}} активных пользователя',
    activeUsers_many: '{{count}} активных пользователей',
    activeUsers_other: '{{count}} активного пользователя',
    lists_one: '{{count}} список рассылки',
    lists_few: '{{count}} списка рассылки',
    lists_many: '{{count}} списков рассылки',
    lists_other: '{{count}} списка рассылки',
  },
  received: {
    title: 'Недавно отправленные вам',
    all: 'Все мои протоколы',
  },
};

export default dashboard;
