import type { Messages } from '../../types';
import type en from '../en/templates';

const templates: Messages<typeof en> = {
  description: 'Ce conțin procesele-verbale trimise prin e-mail după o ședință, pentru fiecare tip de ședință.',
  meetingTypeAria: 'Tip de ședință',
  editor: {
    tabLabel: 'Editor',
    sectionsTitle: 'Secțiunile e-mailului',
    sectionsDescription:
      'Alegeți ce conține procesul-verbal trimis prin e-mail și folosiți săgețile pentru a schimba ordinea. Secțiunile dezactivate apar estompate și sunt omise.',
    moveUpAria: 'Mută {{section}} mai sus',
    moveDownAria: 'Mută {{section}} mai jos',
    advanced: 'Avansat',
    advancedDescription:
      'Ajustați ce arată secțiunea Subiecte și dați instrucțiuni suplimentare AI-ului local. Majoritatea administratorilor nu vor avea nevoie de asta.',
    topicFieldsTitle: 'Ce arată fiecare subiect',
    topicFieldsDescription: 'Care dintre acestea apar sub fiecare subiect din secțiunea Subiecte.',
    instructionsLabel: 'Instrucțiuni pentru AI-ul local',
    instructionsDescription:
      'Instrucțiuni suplimentare pentru AI-ul local care scrie procesul-verbal al acestui tip de ședință.',
    instructionsTooLong: 'Cel mult {{max}} de caractere.',
    noteLabel: 'Ce s-a schimbat (opțional)',
    notePlaceholder: 'Descrieți ce s-a schimbat (opțional)',
    noteTooLong: 'Cel mult {{max}} de caractere.',
    counter: '{{count}}/{{max}} caractere',
    unsavedBadge: 'Modificări nesalvate',
    discard: 'Renunță',
    save: 'Salvează',
    saved: 'Salvat ca versiunea {{version}}.',
  },
  sections: {
    summary: { label: 'Rezumat', description: 'Un paragraf scurt care rezumă ședința.' },
    key_moments: {
      label: 'Momente-cheie',
      description: 'Momentele importante ale ședinței, în ordinea în care au avut loc.',
    },
    topics: { label: 'Subiecte', description: 'Fiecare subiect discutat, cu starea, constatările și deciziile sale.' },
    other_decisions: { label: 'Alte decizii', description: 'Decizii care nu țin de niciun subiect.' },
    action_items: { label: 'Sarcini', description: 'Sarcini, cu responsabilul, termenul și prioritatea lor.' },
    open_issues: { label: 'Probleme nerezolvate', description: 'Întrebări rămase nerezolvate.' },
    attendees: { label: 'Prezenți', description: 'Toți cei prezenți la ședință.' },
    participants: { label: 'Participanți', description: 'Timpul de vorbire per vorbitor, ghicit de AI-ul local.' },
    warnings: {
      label: 'Note de verificare',
      description: 'Valori menționate în procesul-verbal care nu au putut fi confirmate în transcriere.',
    },
  },
  topicFields: {
    status: 'Stare',
    findings: 'Constatări',
    decisions: 'Decizii',
  },
  preview: {
    title: 'Previzualizare',
    description: 'Cum va arăta procesul-verbal trimis prin e-mail, cu conținut exemplu.',
    empty: 'Nicio secțiune activă: procesul-verbal nu ar arăta nimic.',
  },
  history: {
    title: 'Istoricul versiunilor',
    intro:
      'Fiecare salvare creează o versiune nouă, deci ce a fost deja trimis nu se schimbă niciodată. Restaurați o versiune mai veche pentru a-i aduce înapoi secțiunile și instrucțiunile, ca versiune nouă.',
    table: { version: 'Versiune', date: 'Data', author: 'Autor', note: 'Notă', actions: 'Acțiuni' },
    builtIn: 'Implicit',
    activeBadge: 'Activă',
    view: 'Vizualizează',
    viewTitle: 'Versiunea {{version}}',
    restore: 'Restaurează',
    restoreConfirm: {
      title: 'Restaurați versiunea {{version}}?',
      body: 'Aceasta creează o versiune nouă cu aceleași secțiuni, câmpuri și instrucțiuni ca versiunea {{version}}. Ce a fost deja trimis nu este afectat.',
    },
    restored: 'Restaurat ca versiunea {{version}}.',
  },
};

export default templates;
