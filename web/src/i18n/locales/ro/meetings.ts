import type { Messages } from '../../types';
import type en from '../en/meetings';

const meetings: Messages<typeof en> = {
  untitled: 'Ședință fără titlu',
  processingFailed: 'Procesare eșuată',

  meetingsPage: {
    description: {
      admin: 'Ședințele tuturor moderatorilor.',
      user: 'Ședințele dumneavoastră și procesele-verbale primite.',
    },
    emptyTitle: 'Nicio ședință încă',
    emptyDescription:
      'Încărcați o înregistrare sau înregistrați o ședință pentru a obține un proiect de proces-verbal.',
    searchPlaceholder: 'Titlu sau autor',
    status: 'Stare',
    anyStatus: 'Orice stare',
    type: 'Tip',
    anyType: 'Orice tip',
    noMatches: 'Nicio ședință nu corespunde acestor filtre.',
    table: {
      title: 'Titlu',
      type: 'Tip',
      status: 'Stare',
      progress: 'Progres',
      date: 'Data',
      owner: 'Creat de',
      length: 'Durată',
      actions: 'Acțiuni',
    },
    actions: { aria: 'Acțiuni pentru {{title}}', open: 'Deschide' },
    progress: {
      queued: 'Așteaptă la coadă',
      processing: 'Se pornește',
      ready: 'Proces-verbal de revizuit',
      approved: 'Aprobat, gata de trimis',
      sent: 'Trimis {{date}}',
    },
  },

  newMeetingPage: {
    description: 'Încărcați o înregistrare sau înregistrați aici ședința. Totul este procesat pe acest server.',
    leaveGuard: 'Înregistrarea nu a fost încă încărcată și se va pierde.',
    invalidFile: '{{name}} nu este un fișier audio sau video.',
    unnamedFile: 'Acest fișier',
    uploaded: 'Încărcat. Transcrierea a început.',
    recordingStep: '1. Înregistrare',
    source: { upload: 'Încarcă un fișier', record: 'Înregistrează acum', aria: 'Sursa înregistrării' },
    dropzone: {
      aria: 'Fișierul înregistrării',
      title: 'Trageți înregistrarea aici sau apăsați pentru a o alege',
      hint: 'Audio sau video: m4a, mp3, wav, ogg, webm, mp4, mov…',
    },
    removeRecording: 'Elimină înregistrarea',
    meetingStep: '2. Ședință',
    meetingType: {
      label: 'Tipul ședinței',
      description: 'Alege cum este redactat procesul-verbal și cine îl primește.',
    },
    minutesLanguage: {
      label: 'Limba procesului-verbal',
      description: 'Limba în care sunt redactate procesul-verbal și emailul, indiferent ce limbi se vorbesc.',
    },
    titleField: { label: 'Titlu', description: 'Opțional.', placeholder: 'ex. Consiliu medical 26.09' },
    uploading: 'Se încarcă… {{percent}} %',
    checkingFile: 'Se verifică fișierul…',
    cancelUpload: 'Anulează încărcarea',
    submit: 'Încarcă și procesează',
    footer: 'Înregistrarea este transcrisă și rezumată pe acest server. O ședință de o oră durează câteva minute.',
  },

  recorder: {
    notAvailable: {
      title: 'Înregistrarea nu este disponibilă',
      body: 'Acest browser nu poate înregistra aici. Înregistrarea are nevoie de un browser recent și de o adresă securizată (https, sau acest calculator). Puteți încărca în schimb un fișier.',
    },
    error: {
      denied: 'Accesul la microfon a fost refuzat. Permiteți-l în browser pentru a înregistra.',
      notFound: 'Niciun microfon nu a fost găsit.',
      notReadable: 'Microfonul este folosit de o altă aplicație.',
      generic: 'Microfonul nu a putut fi pornit.',
    },
    paused: 'În pauză',
    levelAria: 'Nivelul microfonului',
    pause: 'Pauzează',
    resume: 'Continuă',
    stop: 'Oprește',
    start: 'Rec',
    hint: 'Înregistrează ședința cu microfonul acestui calculator. O puteți asculta înainte de a o încărca.',
  },

  meetingPage: {
    title: 'Ședință',
    facts: {
      by: 'De {{name}}',
      length: 'Durată {{duration}}',
      language: 'Limba: {{language}}',
      spoken: { ro: 'Limba: română', ru: 'Limba: rusă', en: 'Limba: engleză' },
      minutesIn: { ro: 'Proces-verbal în română', ru: 'Proces-verbal în rusă', en: 'Proces-verbal în engleză' },
      processedIn: 'Procesat în {{duration}}',
    },
    menu: {
      aria: 'Acțiuni pentru ședință',
      delete: 'Șterge ședința',
      deleteProcessing: 'Șterge (după procesare)',
    },
    deleteConfirm: {
      title: 'Ștergeți această ședință?',
      body: 'Înregistrarea, transcrierea și procesul-verbal sunt șterse de pe server. Această acțiune nu poate fi anulată.',
    },
    deleted: 'Ședință ștearsă.',
    tabs: { minutes: 'Proces-verbal', transcript: 'Transcriere', send: 'Trimite' },
    failedAlert: {
      fallback: 'Înregistrarea nu a putut fi procesată.',
      suffix: 'Verificați fișierul și încărcați-l din nou.',
    },
  },

  processingCard: {
    waiting: 'Așteaptă să înceapă',
    timeSinceUpload: 'Timp de la încărcare',
    transcriptionProgress: 'Progresul transcrierii',
    footer: 'Această pagină se actualizează singură. O puteți părăsi: procesarea continuă pe server.',
  },

  transcriptTab: {
    recordingAria: 'Înregistrarea ședinței',
    searchPlaceholder: 'Cuvinte din transcriere',
    speaker: 'Vorbitor',
    allSpeakers: 'Toți vorbitorii',
    lines_one: '{{count}} replică',
    lines_few: '{{count}} replici',
    lines_other: '{{count}} de replici',
    summary_one: '{{shown}} din {{count}} replică',
    summary_few: '{{shown}} din {{count}} replici',
    summary_other: '{{shown}} din {{count}} de replici',
    noMatches: 'Niciun rezultat.',
    playFrom: 'Redă de la {{time}}',
    accent: 'accent {{accent}}',
  },

  sendTab: {
    recipients: {
      title: 'Destinatari',
      to: 'Către',
      cc: 'Cc',
      nobodyYet: 'Niciunul încă.',
      removeAria: 'Elimină {{email}}',
    },
    lists: {
      title: 'Liste de distribuție',
      empty: 'Nicio listă de distribuție pentru ședințele de tip {{type}}. Un administrator poate crea una.',
      memberCounts: '{{to}} la Către · {{cc}} la Cc',
      anyType: ' · pentru orice tip de ședință',
    },
    attendees: {
      add: 'Adaugă din nou participanții (Către)',
      hint: 'Persoanele prezente care au cont sunt deja la Către; butonul le readaugă pe cele eliminate.',
    },
    colleague: {
      label: 'Adaugă un coleg (Către)',
      placeholder: 'Caută după nume sau funcție',
      nothingFound: 'Niciun rezultat',
    },
    cc: {
      label: 'Adaugă altă persoană (Cc)',
      invalidEmail: 'Introduceți o adresă de email validă',
      outsideDomain: 'Doar adrese la {{domains}}',
      hint: 'Procesul-verbal poate fi trimis doar la adrese de la {{domains}}.',
    },
    outsideAlert: {
      title: 'În afara domeniilor permise',
      body: 'Procesul-verbal poate fi trimis doar la {{domains}}. Eliminați {{emails}} pentru a trimite.',
    },
    footerNote: 'Livrat prin serverul de e-mail propriu al spitalului. Nimic nu iese din rețea.',
    send: 'Trimite procesul-verbal',
    confirmSend: {
      title: 'Trimiteți procesul-verbal?',
      body_one:
        'Procesul-verbal aprobat este trimis către {{count}} destinatar la Către și {{ccCount}} la Cc, prin serverul de e-mail propriu al spitalului.',
      body_few:
        'Procesul-verbal aprobat este trimis către {{count}} destinatari la Către și {{ccCount}} la Cc, prin serverul de e-mail propriu al spitalului.',
      body_other:
        'Procesul-verbal aprobat este trimis către {{count}} de destinatari la Către și {{ccCount}} la Cc, prin serverul de e-mail propriu al spitalului.',
      confirm: 'Trimite',
    },
    sent: {
      title: 'Proces-verbal trimis',
      body: 'Trimis pe {{date}} prin serverul de e-mail propriu al spitalului.',
    },
    approveFirst: {
      title: 'Aprobați mai întâi procesul-verbal',
      body: 'Verificați proiectul din fila Proces-verbal și apăsați „Sunt de acord”. Apoi alegeți destinatarii aici.',
    },
    emailPreview: {
      title: 'Previzualizare email',
      subject: 'Subiect:',
      to: 'Către:',
      cc: 'Cc:',
      attachment: 'Atașament:',
    },
  },

  minutesTab: {
    approvalBar: {
      sentTitle: 'Trimis {{date}}',
      sentToCount_one: 'la {{count}} destinatar',
      sentToCount_few: 'la {{count}} destinatari',
      sentToCount_other: 'la {{count}} de destinatari',
      approvedTitle: 'Aprobat · gata de trimis',
      sentSubtitle: 'Aprobat de {{name}} la {{date}}',
      approvedSubtitle: 'Doar pentru citire până la redeschidere; aprobat de {{name}} la {{date}}',
      defaultApprover: 'un moderator',
      reopen: 'Redeschide pentru editare',
    },
  },

  preview: {
    button: 'Previzualizare e-mail',
    title: 'E-mailul așa cum va fi trimis',
    subject: 'Subiect',
    attachment: 'Atașament',
    pdf: 'Procesul-verbal (PDF)',
    note: 'Destinatarii se aleg după ce vă dați acordul.',
  },
  minutesEditor: {
    titleRequired: 'Procesul-verbal are nevoie de un titlu',
    unsavedGuard: 'Modificările la procesul-verbal nu sunt salvate.',
    saved: 'Proces-verbal salvat.',
    approvedNotice: 'Proces-verbal aprobat. Alegeți destinatarii și trimiteți-l.',
    statusUnsaved: 'Modificări nesalvate',
    statusSaved: 'Proiect de proces-verbal · toate modificările salvate',
    discard: 'Renunță',
    doneEditing: 'Gata cu editarea',
    saveTitle: 'Salvează (Ctrl+S / ⌘S)',
    agree: 'Sunt de acord',
    approveModal: {
      title: 'Aprobați procesul-verbal?',
      body: 'Apăsând „Sunt de acord” confirmați că acest proces-verbal este corect. Acesta devine needitabil și poate fi trimis destinatarilor. Îl puteți redeschide până este trimis.',
      unsavedNotice: 'Modificările nesalvate sunt salvate mai întâi.',
      warnings_one: '{{count}} valoare semnalată de verificarea automată nu este marcată drept verificată.',
      warnings_few: '{{count}} valori semnalate de verificarea automată nu sunt marcate drept verificate.',
      warnings_other: '{{count}} de valori semnalate de verificarea automată nu sunt marcate drept verificate.',
    },
    discardModal: {
      title: 'Renunțați la modificări?',
      body: 'Procesul-verbal revine la ultima versiune salvată.',
      cancel: 'Continuă editarea',
    },
    split: {
      open: 'Editare cu previzualizare',
      title: 'Editare cu previzualizare în timp real',
      done: 'Gata',
      editor: 'Editor',
      preview: 'Previzualizare e-mail',
      previewNote: 'E-mailul așa cum va fi trimis, actualizat pe măsură ce scrieți.',
    },
  },
};

export default meetings;
