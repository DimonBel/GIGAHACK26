import type { Messages } from '../../types';
import type en from '../en/email';

const email: Messages<typeof en> = {
  meetingLabel: {
    medical: 'Ședință medicală',
    executive: 'Ședință de conducere',
    administrative: 'Ședință administrativă',
  },
  minutes: 'Proces-verbal',
  approvedBy: 'aprobat de {{name}}',
  defaultTitle: 'Proces-verbal al ședinței',
  summary: 'Rezumat',
  keyMoments: 'Momente-cheie',
  topics: 'Subiecte',
  status: 'Stare',
  findings: 'Constatări',
  decisions: 'Decizii',
  otherDecisions: 'Alte decizii',
  actionItems: 'Sarcini',
  actionItemsTable: {
    task: 'Sarcină',
    topic: 'Subiect',
    owner: 'Responsabil',
    deadline: 'Termen',
    priority: 'Prioritate',
  },
  priority: { high: 'ridicată', medium: 'medie', low: 'scăzută' },
  openIssues: 'Probleme nerezolvate',
  present: 'Prezenți',
  participants: 'Participanți',
  verification: 'Note de verificare',
  untitledTopic: 'Fără titlu',
  duration: { minutes: '{{m}} min {{s}} s', hours: '{{h}} h {{m}} min' },
};

export default email;
