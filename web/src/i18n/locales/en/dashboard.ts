/** The start page. */
const dashboard = {
  greeting: {
    morning: 'Good morning, {{name}}',
    afternoon: 'Good afternoon, {{name}}',
    evening: 'Good evening, {{name}}',
  },
  stats: {
    drafts: 'Meetings to review',
    inProgress: 'Being processed',
    toSend: 'Approved, not sent',
    sent: 'Sent',
  },
  attention: {
    title: 'Needs your attention',
    empty: 'Nothing is waiting for you.',
    ready: 'Review and approve the minutes',
    approved: 'Choose the recipients and send',
    failed: 'Processing failed: upload it again',
  },
  recent: {
    title: 'Recent meetings',
    all: 'All meetings',
    empty: 'No meetings yet. Upload or record the first one.',
  },
  admin: {
    title: 'Administration',
    activeUsers_one: '{{count}} active user',
    activeUsers_other: '{{count}} active users',
    lists_one: '{{count}} distribution list',
    lists_other: '{{count}} distribution lists',
  },
  received: {
    title: 'Recently sent to you',
    all: 'All my minutes',
  },
};

export default dashboard;
