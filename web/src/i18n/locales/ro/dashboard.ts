import type { Messages } from '../../types';
import type en from '../en/dashboard';

const dashboard: Messages<typeof en> = {
  greeting: {
    morning: 'Bună dimineața, {{name}}',
    afternoon: 'Bună ziua, {{name}}',
    evening: 'Bună seara, {{name}}',
  },
  stats: {
    drafts: 'Ședințe de revizuit',
    inProgress: 'În procesare',
    toSend: 'Aprobate, netrimise',
    sent: 'Trimise',
  },
  attention: {
    title: 'Necesită atenția dumneavoastră',
    empty: 'Nimic nu vă așteaptă.',
    ready: 'Revizuiți și aprobați procesul-verbal',
    approved: 'Alegeți destinatarii și trimiteți',
    failed: 'Procesarea a eșuat: încărcați din nou înregistrarea',
  },
  recent: {
    title: 'Ședințe recente',
    all: 'Toate ședințele',
    empty: 'Nu există încă ședințe. Încărcați sau înregistrați prima.',
  },
  admin: {
    title: 'Administrare',
    activeUsers_one: '{{count}} utilizator activ',
    activeUsers_few: '{{count}} utilizatori activi',
    activeUsers_other: '{{count}} de utilizatori activi',
    lists_one: '{{count}} listă de distribuție',
    lists_few: '{{count}} liste de distribuție',
    lists_other: '{{count}} de liste de distribuție',
  },
  received: {
    title: 'Trimise recent către dumneavoastră',
    all: 'Toate procesele-verbale primite',
  },
};

export default dashboard;
