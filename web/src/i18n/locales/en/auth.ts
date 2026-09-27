/** Signing in and changing the password. */
const auth = {
  login: {
    email: 'Email',
    password: 'Password',
    submit: 'Sign in',
    failed: 'Sign-in failed.',
    enterEmail: 'Enter your email address',
    enterPassword: 'Enter your password',
    copyright: '© 2026 Gigahack. All rights reserved.',
  },
  profile: {
    email: 'Email',
    role: 'Role in the app',
    jobTitle: 'Function',
    position: 'Position',
    specialty: 'Specialty',
    since: 'Account created',
    notSet: 'Not set',
    managed: 'An administrator keeps these details; ask them to change anything.',
    changePassword: 'Change password',
  },
  password: {
    title: 'Change password',
    mustChange: 'An administrator set your password. Choose your own to continue.',
    otherSessions: 'Your other sessions are signed out when you change it.',
    current: 'Current password',
    new: 'New password',
    newHint: 'At least {{min}} characters.',
    repeat: 'Repeat the new password',
    submit: 'Change password',
    enterCurrent: 'Enter your current password',
    tooShort: 'At least {{min}} characters',
    same: 'Choose a new password',
    differ: 'The passwords differ',
    changed: 'Password changed. Your other sessions were signed out.',
    failed: 'The password could not be changed.',
  },
};

export default auth;
