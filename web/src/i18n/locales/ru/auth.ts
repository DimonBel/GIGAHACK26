import type { Messages } from '../../types';
import type en from '../en/auth';

const auth: Messages<typeof en> = {
  login: {
    email: 'Эл. почта',
    password: 'Пароль',
    submit: 'Войти',
    failed: 'Не удалось войти.',
    enterEmail: 'Введите адрес эл. почты',
    enterPassword: 'Введите пароль',
    copyright: '© 2026 Gigahack. Все права защищены.',
  },
  profile: {
    email: 'Эл. почта',
    role: 'Роль в приложении',
    jobTitle: 'Должность',
    position: 'Позиция',
    specialty: 'Специальность',
    since: 'Учётная запись создана',
    notSet: 'Не указано',
    managed: 'Эти данные ведёт администратор; обратитесь к нему, чтобы что-то изменить.',
    changePassword: 'Сменить пароль',
  },
  password: {
    title: 'Смена пароля',
    mustChange: 'Пароль задал администратор. Чтобы продолжить, выберите свой.',
    otherSessions: 'После смены пароля другие ваши сеансы будут завершены.',
    current: 'Текущий пароль',
    new: 'Новый пароль',
    newHint: 'Не менее {{min}} символов.',
    repeat: 'Повторите новый пароль',
    submit: 'Сменить пароль',
    enterCurrent: 'Введите текущий пароль',
    tooShort: 'Не менее {{min}} символов',
    same: 'Выберите новый пароль',
    differ: 'Пароли не совпадают',
    changed: 'Пароль изменён. Другие ваши сеансы завершены.',
    failed: 'Не удалось сменить пароль.',
  },
};

export default auth;
