import type { Messages } from '../../types';
import type en from '../en/email';

const email: Messages<typeof en> = {
  meetingLabel: {
    medical: 'Медицинское совещание',
    executive: 'Совещание руководства',
    administrative: 'Административное совещание',
  },
  minutes: 'Протокол',
  approvedBy: 'утверждено: {{name}}',
  defaultTitle: 'Протокол совещания',
  summary: 'Краткое содержание',
  keyMoments: 'Ключевые моменты',
  topics: 'Темы',
  status: 'Состояние',
  findings: 'Данные',
  decisions: 'Решения',
  otherDecisions: 'Другие решения',
  actionItems: 'Поручения',
  actionItemsTable: {
    task: 'Поручение',
    topic: 'Тема',
    owner: 'Ответственный',
    deadline: 'Срок',
    priority: 'Приоритет',
  },
  priority: { high: 'высокий', medium: 'средний', low: 'низкий' },
  openIssues: 'Открытые вопросы',
  present: 'Присутствовали',
  participants: 'Участники',
  verification: 'Замечания по проверке',
  untitledTopic: 'Без названия',
  duration: { minutes: '{{m}} мин {{s}} с', hours: '{{h}} ч {{m}} мин' },
};

export default email;
