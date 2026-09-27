/** The minutes as the email shows them (the preview, the printed minutes): always in the language the minutes
 *  were written in, never the app's own. The same words as the server's email (stt/minutes/labels.py). */
const email = {
  meetingLabel: {
    medical: 'Medical meeting',
    executive: 'Executive meeting',
    administrative: 'Administrative meeting',
  },
  minutes: 'Minutes',
  approvedBy: 'approved by {{name}}',
  defaultTitle: 'Minutes of Meeting',
  summary: 'Summary',
  keyMoments: 'Key moments',
  topics: 'Topics',
  status: 'Status',
  findings: 'Findings',
  decisions: 'Decisions',
  otherDecisions: 'Other decisions',
  actionItems: 'Action items',
  actionItemsTable: { task: 'Task', topic: 'Topic', owner: 'Owner', deadline: 'Deadline', priority: 'Priority' },
  priority: { high: 'high', medium: 'medium', low: 'low' },
  openIssues: 'Open issues',
  present: 'Present',
  participants: 'Participants',
  verification: 'Verification notes',
  untitledTopic: 'Untitled',
  duration: { minutes: '{{m}} min {{s}} s', hours: '{{h}} h {{m}} min' },
};

export default email;
