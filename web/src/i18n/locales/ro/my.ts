import type { Messages } from '../../types';
import type en from '../en/my';

const my: Messages<typeof en> = {
  title: 'Procese-verbale primite',
  description: 'Procesele-verbale ale ședințelor care v-au fost trimise.',
  emptyTitle: 'Nimic deocamdată',
  emptyDescription: 'Procesele-verbale apar aici după ce un moderator vi le trimite.',
  untitled: 'Proces-verbal al ședinței',
  open: 'Deschide procesul-verbal: {{title}}',
  sent: 'Trimis pe {{date}} de {{name}}',
  minutes: 'Proces-verbal',
  search: 'Caută după titlu',
  noMatch: 'Niciun proces-verbal nu corespunde.',
};

export default my;
