/** Admin: what the minutes emailed after a meeting contain, per meeting type, and their version history. */
const templates = {
  description: 'What the minutes emailed after a meeting contain, per meeting type.',
  meetingTypeAria: 'Meeting type',
  editor: {
    tabLabel: 'Editor',
    sectionsTitle: 'Sections of the email',
    sectionsDescription:
      'Choose what the emailed minutes include, and use the arrows to reorder them. Sections that are off are dimmed and skipped.',
    moveUpAria: 'Move {{section}} up',
    moveDownAria: 'Move {{section}} down',
    advanced: 'Advanced',
    advancedDescription:
      'Fine-tune what the Topics section shows, and give the local AI extra instructions. Most admins will not need this.',
    topicFieldsTitle: 'What each topic shows',
    topicFieldsDescription: 'Which of these appear under each subject in the Topics section.',
    instructionsLabel: 'Instructions for the local AI',
    instructionsDescription: 'Extra instructions for the local AI that writes the minutes of this meeting type.',
    instructionsTooLong: 'At most {{max}} characters.',
    noteLabel: 'What changed (optional)',
    notePlaceholder: 'Describe what changed (optional)',
    noteTooLong: 'At most {{max}} characters.',
    counter: '{{count}}/{{max}} characters',
    unsavedBadge: 'Unsaved changes',
    discard: 'Discard',
    save: 'Save',
    saved: 'Saved as version {{version}}.',
  },
  sections: {
    summary: { label: 'Summary', description: 'A short paragraph summarizing the meeting.' },
    key_moments: {
      label: 'Key moments',
      description: 'The notable moments of the meeting, in the order they happened.',
    },
    topics: { label: 'Topics', description: 'Each subject discussed, with its status, findings and decisions.' },
    other_decisions: { label: 'Other decisions', description: 'Decisions not tied to any topic.' },
    action_items: { label: 'Action items', description: 'Tasks, with their owner, deadline and priority.' },
    open_issues: { label: 'Open issues', description: 'Questions left unresolved.' },
    attendees: { label: 'Attendees', description: 'Everyone present at the meeting.' },
    participants: { label: 'Participants', description: 'Talk time per speaker, guessed by the local AI.' },
    warnings: {
      label: 'Verification notes',
      description: 'Values the minutes state that could not be confirmed in the transcript.',
    },
  },
  topicFields: {
    status: 'Status',
    findings: 'Findings',
    decisions: 'Decisions',
  },
  preview: {
    title: 'Preview',
    description: 'What the emailed minutes will look like, with example content.',
    empty: 'No sections enabled: the minutes would show nothing.',
  },
  history: {
    title: 'Version history',
    intro:
      'Every save creates a new version, so nothing already sent is ever changed. Restore an older version to bring back its sections and instructions as a new version.',
    table: { version: 'Version', date: 'Date', author: 'Author', note: 'Note', actions: 'Actions' },
    builtIn: 'Built-in',
    activeBadge: 'Active',
    view: 'View',
    viewTitle: 'Version {{version}}',
    restore: 'Restore',
    restoreConfirm: {
      title: 'Restore version {{version}}?',
      body: 'This creates a new version with the same sections, fields and instructions as version {{version}}. Nothing already sent is affected.',
    },
    restored: 'Restored as version {{version}}.',
  },
};

export default templates;
