import type { Messages } from '../../types';
import type en from '../en/auth';

const auth: Messages<typeof en> = {
  login: {
    email: 'E-mail',
    password: 'Parolă',
    submit: 'Autentificare',
    failed: 'Autentificarea a eșuat.',
    enterEmail: 'Introduceți adresa de e-mail',
    enterPassword: 'Introduceți parola',
    copyright: '© 2026 Gigahack. Toate drepturile rezervate.',
  },
  profile: {
    email: 'E-mail',
    role: 'Rol în aplicație',
    jobTitle: 'Funcție',
    position: 'Poziție',
    specialty: 'Specialitate',
    since: 'Cont creat',
    notSet: 'Necompletat',
    managed: 'Aceste date sunt gestionate de un administrator; adresați-vă lui pentru orice modificare.',
    changePassword: 'Schimbă parola',
  },
  password: {
    title: 'Schimbarea parolei',
    mustChange: 'Parola v-a fost setată de un administrator. Alegeți una proprie pentru a continua.',
    otherSessions: 'Celelalte sesiuni ale dumneavoastră se închid când o schimbați.',
    current: 'Parola actuală',
    new: 'Parola nouă',
    newHint: 'Cel puțin {{min}} caractere.',
    repeat: 'Repetați parola nouă',
    submit: 'Schimbă parola',
    enterCurrent: 'Introduceți parola actuală',
    tooShort: 'Cel puțin {{min}} caractere',
    same: 'Alegeți o parolă nouă',
    differ: 'Parolele diferă',
    changed: 'Parola a fost schimbată. Celelalte sesiuni au fost închise.',
    failed: 'Parola nu a putut fi schimbată.',
  },
};

export default auth;
