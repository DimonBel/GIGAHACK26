/** Every text of the app, by language and namespace (one namespace per area of the app). */
import enCommon from './locales/en/common';
import enAuth from './locales/en/auth';
import enDashboard from './locales/en/dashboard';
import enMy from './locales/en/my';
import enMeetings from './locales/en/meetings';
import enMinutes from './locales/en/minutes';
import enEmail from './locales/en/email';
import enAdmin from './locales/en/admin';
import enTemplates from './locales/en/templates';
import roCommon from './locales/ro/common';
import roAuth from './locales/ro/auth';
import roDashboard from './locales/ro/dashboard';
import roMy from './locales/ro/my';
import roMeetings from './locales/ro/meetings';
import roMinutes from './locales/ro/minutes';
import roEmail from './locales/ro/email';
import roAdmin from './locales/ro/admin';
import roTemplates from './locales/ro/templates';
import ruCommon from './locales/ru/common';
import ruAuth from './locales/ru/auth';
import ruDashboard from './locales/ru/dashboard';
import ruMy from './locales/ru/my';
import ruMeetings from './locales/ru/meetings';
import ruMinutes from './locales/ru/minutes';
import ruEmail from './locales/ru/email';
import ruAdmin from './locales/ru/admin';
import ruTemplates from './locales/ru/templates';

export const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    dashboard: enDashboard,
    my: enMy,
    meetings: enMeetings,
    minutes: enMinutes,
    email: enEmail,
    admin: enAdmin,
    templates: enTemplates,
  },
  ro: {
    common: roCommon,
    auth: roAuth,
    dashboard: roDashboard,
    my: roMy,
    meetings: roMeetings,
    minutes: roMinutes,
    email: roEmail,
    admin: roAdmin,
    templates: roTemplates,
  },
  ru: {
    common: ruCommon,
    auth: ruAuth,
    dashboard: ruDashboard,
    my: ruMy,
    meetings: ruMeetings,
    minutes: ruMinutes,
    email: ruEmail,
    admin: ruAdmin,
    templates: ruTemplates,
  },
};
