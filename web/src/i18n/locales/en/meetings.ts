/** Meetings: the list, a new meeting, one meeting's tabs (minutes, transcript, send) and the recorder. */
const meetings = {
  untitled: 'Untitled meeting',
  processingFailed: 'Processing failed',

  meetingsPage: {
    description: {
      admin: 'The meetings of all moderators.',
      user: 'Your meetings, and the minutes sent to you.',
    },
    emptyTitle: 'No meetings yet',
    emptyDescription: 'Upload a recording or record a meeting to get draft minutes.',
    searchPlaceholder: 'Title or author',
    status: 'Status',
    anyStatus: 'Any status',
    type: 'Type',
    anyType: 'Any type',
    noMatches: 'No meeting matches these filters.',
    table: {
      title: 'Title',
      type: 'Type',
      status: 'Status',
      progress: 'Progress',
      date: 'Date',
      owner: 'Created by',
      length: 'Length',
      actions: 'Actions',
    },
    actions: { aria: 'Actions for {{title}}', open: 'Open' },
    progress: {
      queued: 'Waiting in the queue',
      processing: 'Starting',
      ready: 'Minutes to review',
      approved: 'Approved, ready to send',
      sent: 'Sent {{date}}',
    },
  },

  newMeetingPage: {
    description: 'Upload a recording or record the meeting here. Everything is processed on this server.',
    leaveGuard: 'The recording has not been uploaded yet and will be lost.',
    invalidFile: '{{name}} is not an audio or video file.',
    unnamedFile: 'This file',
    uploaded: 'Uploaded. The transcription has started.',
    recordingStep: 'Recording',
    source: { upload: 'Upload a file', record: 'Record now', aria: 'Recording source' },
    dropzone: {
      aria: 'Recording file',
      title: 'Drop the recording here or click to choose it',
      hint: 'Audio or video: m4a, mp3, wav, ogg, webm, mp4, mov…',
    },
    removeRecording: 'Remove the recording',
    noPreview:
      "This browser can't play this file's format (for example Apple Lossless), so there is no preview. The recording will be processed normally.",
    meetingStep: 'Meeting',
    meetingType: {
      label: 'Meeting type',
      description: 'Chooses how the minutes are written and who receives them.',
    },
    minutesLanguage: {
      label: 'Minutes language',
      description: 'The language the minutes and the email are written in, whatever languages are spoken.',
    },
    titleField: { label: 'Title', description: 'Optional.', placeholder: 'e.g. Medical board 26.09' },
    uploading: 'Uploading… {{percent}} %',
    checkingFile: 'Checking the file…',
    cancelUpload: 'Cancel upload',
    submit: 'Upload and process',
    footer: 'The recording is transcribed and summarised on this server. A one-hour meeting takes a few minutes.',
  },

  recorder: {
    notAvailable: {
      title: 'Recording is not available',
      body: 'This browser cannot record here. Recording needs a current browser and a secure address (https, or this computer). You can upload a file instead.',
    },
    error: {
      denied: 'Microphone access was denied. Allow it in the browser to record.',
      notFound: 'No microphone was found.',
      notReadable: 'The microphone is being used by another application.',
      generic: 'The microphone could not be started.',
    },
    paused: 'Paused',
    levelAria: 'Microphone level',
    pause: 'Pause',
    resume: 'Resume',
    stop: 'Stop',
    start: 'Rec',
    hint: "Records the meeting with this computer's microphone. You can listen to it before uploading.",
  },

  meetingPage: {
    title: 'Meeting',
    facts: {
      by: 'By {{name}}',
      length: 'Length {{duration}}',
      language: 'Language: {{language}}',
      spoken: { ro: 'Language: Romanian', ru: 'Language: Russian', en: 'Language: English' },
      minutesIn: { ro: 'Minutes in Romanian', ru: 'Minutes in Russian', en: 'Minutes in English' },
      processedIn: 'Processed in {{duration}}',
    },
    menu: {
      aria: 'Meeting actions',
      delete: 'Delete meeting',
      deleteProcessing: 'Delete (after processing)',
    },
    deleteConfirm: {
      title: 'Delete this meeting?',
      body: 'The recording, the transcript and the minutes are deleted from the server. This cannot be undone.',
    },
    deleted: 'Meeting deleted.',
    tabs: { minutes: 'Minutes', transcript: 'Transcript', send: 'Send' },
    failedAlert: {
      fallback: 'The recording could not be processed.',
      suffix: 'Check the file and upload it again.',
    },
  },

  processingCard: {
    waiting: 'Waiting to start',
    queuedHint: 'Processing starts as soon as the meeting before it is done.',
    activity: {
      converting: 'Preparing the recording…',
      transcribing: 'Turning speech into text, sentence by sentence…',
      speakers: 'Working out who said what…',
      minutes: 'Writing the minutes from the transcript…',
    },
    timeSinceUpload: 'Time since upload',
    transcriptionProgress: 'Transcription progress',
    footer: 'This page updates by itself. You can leave it: the processing continues on the server.',
    live: {
      badge: 'Live',
      title: 'Live transcript',
      empty: 'The first words will appear here as soon as the recording starts being heard.',
      identifying: 'identifying…',
      jumpToLatest: 'Jump to latest',
      count_one: '{{count}} line so far',
      count_other: '{{count}} lines so far',
    },
    minutesPreview: {
      title: 'What the minutes will cover',
      empty: 'Topics appear here as they are identified.',
      decisions: 'Decisions',
      tasks: 'Action items',
    },
    done: {
      title: 'Ready!',
      subtitle: 'Opening the minutes…',
    },
  },

  transcriptTab: {
    recordingAria: 'Meeting recording',
    searchPlaceholder: 'Words in the transcript',
    speaker: 'Speaker',
    allSpeakers: 'All speakers',
    lines_one: '{{count}} line',
    lines_other: '{{count}} lines',
    summary_one: '{{shown}} of {{count}} line',
    summary_other: '{{shown}} of {{count}} lines',
    noMatches: 'Nothing matches.',
    playFrom: 'Play from {{time}}',
    accent: '{{accent}} accent',
  },

  sendTab: {
    recipients: {
      title: 'Recipients',
      to: 'To',
      cc: 'CC',
      nobodyYet: 'Nobody yet.',
      removeAria: 'Remove {{email}}',
    },
    lists: {
      title: 'Distribution lists',
      empty: 'No distribution list for {{type}} meetings. An administrator can create one.',
      memberCounts: '{{to}} in To · {{cc}} in CC',
      anyType: ' · for any meeting type',
    },
    attendees: {
      add: 'Add the attendees back (To)',
      hint: 'The people present who have an account are in To already; this adds back the ones you removed.',
    },
    colleague: {
      label: 'Add a colleague (To)',
      placeholder: 'Search by name or position',
      nothingFound: 'Nobody found',
    },
    cc: {
      label: 'Add another person (CC)',
      invalidEmail: 'Enter a valid email address',
      outsideDomain: 'Only addresses at {{domains}}',
      hint: 'Minutes can only be sent to addresses at {{domains}}.',
    },
    outsideAlert: {
      title: 'Outside the allowed domains',
      body: 'Minutes can only go to {{domains}}. Remove {{emails}} to send.',
    },
    footerNote: "Delivered by the hospital's own mail server. Nothing leaves the network.",
    send: 'Send minutes',
    confirmSend: {
      title: 'Send the minutes?',
      body_one:
        "The approved minutes go to {{count}} recipient in To and {{ccCount}} in CC, through the hospital's own mail server.",
      body_other:
        "The approved minutes go to {{count}} recipients in To and {{ccCount}} in CC, through the hospital's own mail server.",
      confirm: 'Send',
    },
    sent: {
      title: 'Minutes sent',
      body: "Sent on {{date}} through the hospital's own mail server.",
    },
    approveFirst: {
      title: 'Approve the minutes first',
      body: 'Review the draft on the Minutes tab and click “I agree”. Then choose the recipients here.',
    },
    emailPreview: {
      title: 'Email preview',
      subject: 'Subject:',
      to: 'To:',
      cc: 'CC:',
      attachment: 'Attachment:',
      message: 'Email message',
      messageDescription: 'The text that goes with the minutes (attached as a PDF). You can change it.',
      restoreDefault: 'Restore the default text',
    },
  },

  minutesTab: {
    approvalBar: {
      sentTitle: 'Sent {{date}}',
      sentToCount_one: 'to {{count}} person',
      sentToCount_other: 'to {{count}} people',
      approvedTitle: 'Approved · ready to send',
      sentSubtitle: 'Approved by {{name}} on {{date}}',
      approvedSubtitle: 'Read-only until reopened; approved by {{name}} on {{date}}',
      defaultApprover: 'a moderator',
      reopen: 'Reopen for editing',
    },
  },

  preview: {
    button: 'Preview email',
    title: 'The email as it will be sent',
    subject: 'Subject',
    attachment: 'Attachment',
    pdf: 'The minutes (PDF)',
    note: 'The recipients are chosen after you agree.',
  },
  minutesEditor: {
    titleRequired: 'The minutes need a title',
    unsavedGuard: 'Your changes to the minutes are not saved.',
    saved: 'Minutes saved.',
    approvedNotice: 'Minutes approved. Choose the recipients and send them.',
    statusUnsaved: 'Unsaved changes',
    statusSaved: 'Draft minutes · all changes saved',
    discard: 'Discard',
    doneEditing: 'Done editing',
    saveTitle: 'Save (Ctrl+S / ⌘S)',
    agree: 'I agree',
    approveModal: {
      title: 'Approve the minutes?',
      body: 'By clicking “I agree” you confirm that these minutes are correct. They become read-only and can be sent to the recipients. You can reopen them until they are sent.',
      unsavedNotice: 'Your unsaved changes are saved first.',
      warnings_one: '{{count}} value flagged by the automatic check is not marked as checked.',
      warnings_other: '{{count}} values flagged by the automatic check are not marked as checked.',
    },
    discardModal: {
      title: 'Discard your changes?',
      body: 'The minutes go back to how they were last saved.',
      cancel: 'Keep editing',
    },
    split: {
      open: 'Edit with preview',
      title: 'Edit with live preview',
      done: 'Done',
      editor: 'Editor',
      preview: 'Email preview',
      previewNote: 'The email as it will be sent, updated as you type.',
    },
  },
};

export default meetings;
