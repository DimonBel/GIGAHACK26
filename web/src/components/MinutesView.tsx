import { memo, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useTemplates } from '../api/queries';
import type { Meeting, MeetingType, Minutes, MinutesLanguage, MinutesTemplate, TemplateSection } from '../api/types';
import { attendeeDetails, focusKey, forRecipients, priorityRank, type MinutesViewFocus } from '../lib/minutesDoc';
import { activeTemplate } from '../lib/templates';

// The email's own styles (server/templates/minutes_email.html), so the preview looks like what arrives.
const page: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #dfe4ea',
  borderRadius: 8,
  padding: 28,
  maxWidth: 760,
  minWidth: 0, // a narrow column scrolls a wide table inside the page instead of overflowing it
  overflowX: 'auto',
  margin: '0 auto',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: 14,
  lineHeight: 1.5,
  color: '#1f2a37',
};
const heading: CSSProperties = {
  margin: '24px 0 8px',
  fontSize: 16,
  borderBottom: '1px solid #e6eaef',
  paddingBottom: 4,
};
const list: CSSProperties = { margin: 0, paddingLeft: 20 };
// A topic's rows: the label column and the text next to it.
const labelCell: CSSProperties = { width: 110, padding: '3px 12px 3px 0', verticalAlign: 'top', color: '#5a6b7d' };
const valueCell: CSSProperties = { padding: '3px 0', verticalAlign: 'top' };
const rowList: CSSProperties = { margin: 0, paddingLeft: 18 };
const cell: CSSProperties = { padding: 6, border: '1px solid #dfe4ea', textAlign: 'left' };
const muted = '#5a6b7d';
// Around the part being edited next to the view; the margin keeps the mark in sight when it is scrolled to.
const focused: CSSProperties = { outline: '2px solid #9fd9da', outlineOffset: 6, borderRadius: 4, scrollMarginTop: 16 };

/** A warning of the automatic check without its "[mm:ss] ": the minutes carry no minute marks. */
const withoutTime = (warning: string) => warning.replace(/^\[\d+:\d{2}(?::\d{2})?\]\s*/, '');

const pad = (value: number) => String(value).padStart(2, '0');

/** "27.09.2026 10:05" in local time, whatever the language, as the email writes when the meeting was held. */
function held(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface MinutesViewProps {
  minutes: Minutes;
  meetingType: MeetingType;
  /** The minutes' own language: what a recipient reads, never the app's language. Defaults to English. */
  language?: MinutesLanguage;
  /** The template to lay them out with; by default the active one of the meeting type. */
  template?: MinutesTemplate;
  /** For the line under the title (meeting, date, length, who approved), as in the email. */
  meeting?: Pick<Meeting, 'title' | 'created_at' | 'duration_s' | 'approved_by'>;
  /** Marked (the live preview next to the editor); each part is found by its data-focus ("summary", "topic:2"). */
  focus?: MinutesViewFocus;
}

/** The minutes exactly as the email shows them (the preview, the live preview while editing, the printed minutes):
 *  in the minutes' own language, laid out by the meeting type's template, with the email's words and styles, and
 *  without the notes for the moderator. Memoized: the live preview renders it only when what it shows changes. */
export const MinutesView = memo(function MinutesView({
  minutes: withNotes,
  meetingType,
  language = 'en',
  template,
  meeting,
  focus,
}: MinutesViewProps) {
  const { t } = useTranslation('email', { lng: language });
  const minutes = forRecipients(withNotes);
  const marked = focusKey(focus);
  const mark = (key: string) => (key === marked ? focused : undefined);

  const templates = useTemplates();
  const layout = template ?? activeTemplate(templates.data, meetingType);
  const fields = layout.topic_fields;
  const topicNames = new Set(minutes.topics.map((topic) => topic.name));
  const otherDecisions = minutes.decisions.filter((decision) => !topicNames.has(decision.patient));
  const actions = [...minutes.action_items].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));

  const minSec = (seconds: number) => t('duration.minutes', { m: Math.floor(seconds / 60), s: pad(seconds % 60) });
  const duration = (seconds: number) => {
    const total = Math.round(seconds);
    return total < 3600
      ? minSec(total)
      : t('duration.hours', { h: Math.floor(total / 3600), m: pad(Math.floor((total % 3600) / 60)) });
  };
  const meta = meeting && [
    meeting.title,
    held(meeting.created_at),
    meeting.duration_s ? duration(meeting.duration_s) : '',
    meeting.approved_by ? t('approvedBy', { name: meeting.approved_by.full_name }) : '',
  ];

  const section = (key: TemplateSection): ReactNode => {
    switch (key) {
      case 'summary':
        return (
          <>
            <h3 style={heading}>{t('summary')}</h3>
            <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{minutes.summary}</p>
          </>
        );
      case 'key_moments':
        return minutes.key_moments.length > 0 ? (
          <>
            <h3 style={heading}>{t('keyMoments')}</h3>
            <ul style={list}>
              {minutes.key_moments.map((moment, index) => (
                <li key={index}>{moment.moment}</li>
              ))}
            </ul>
          </>
        ) : null;
      case 'topics':
        return minutes.topics.length > 0 ? (
          <>
            <h3 style={heading}>{t('topics')}</h3>
            {minutes.topics.map((topic, index) => {
              const decisions = minutes.decisions.filter((decision) => decision.patient === topic.name);
              return (
                <div
                  key={index}
                  data-focus={`topic:${index}`}
                  style={{
                    padding: index ? '12px 0' : '2px 0 12px',
                    borderTop: index ? '1px solid #e6eaef' : undefined,
                    ...mark(`topic:${index}`),
                  }}
                >
                  <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 'bold' }}>
                    <span>{index + 1}.</span> {topic.name || t('untitledTopic')}
                  </p>
                  <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {fields.status && (
                        <tr>
                          <td style={labelCell}>{t('status')}</td>
                          <td style={{ ...valueCell, whiteSpace: 'pre-line' }}>{topic.status || '—'}</td>
                        </tr>
                      )}
                      {fields.findings && topic.findings.length > 0 && (
                        <tr>
                          <td style={labelCell}>{t('findings')}</td>
                          <td style={valueCell}>
                            <ul style={rowList}>
                              {topic.findings.map((finding, findingIndex) => (
                                <li key={findingIndex}>{finding}</li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                      {fields.decisions && decisions.length > 0 && (
                        <tr>
                          <td style={labelCell}>{t('decisions')}</td>
                          <td style={valueCell}>
                            <ul style={rowList}>
                              {decisions.map((decision, decisionIndex) => (
                                <li key={decisionIndex}>{decision.decision}</li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </>
        ) : null;
      case 'other_decisions':
        return otherDecisions.length > 0 ? (
          <>
            <h3 style={heading}>{t('otherDecisions')}</h3>
            <ul style={list}>
              {otherDecisions.map((decision, index) => (
                <li key={index}>
                  {decision.decision}
                  {decision.patient && ` — ${decision.patient}`}
                </li>
              ))}
            </ul>
          </>
        ) : null;
      case 'action_items':
        return actions.length > 0 ? (
          <>
            <h3 style={heading}>{t('actionItems')}</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#eef2f6' }}>
                  <th style={cell}>#</th>
                  <th style={cell}>{t('actionItemsTable.task')}</th>
                  <th style={cell}>{t('actionItemsTable.topic')}</th>
                  <th style={cell}>{t('actionItemsTable.owner')}</th>
                  <th style={cell}>{t('actionItemsTable.deadline')}</th>
                  <th style={cell}>{t('actionItemsTable.priority')}</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((item, index) => (
                  <tr key={index}>
                    <td style={cell}>{index + 1}</td>
                    <td style={cell}>{item.task}</td>
                    <td style={cell}>{item.patient}</td>
                    <td style={cell}>{item.owner}</td>
                    <td style={cell}>{item.deadline}</td>
                    <td style={item.priority === 'high' ? { ...cell, color: '#b42318', fontWeight: 'bold' } : cell}>
                      {t(`priority.${item.priority}`, { defaultValue: item.priority })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null;
      case 'open_issues':
        return minutes.open_issues.length > 0 ? (
          <>
            <h3 style={heading}>{t('openIssues')}</h3>
            <ul style={list}>
              {minutes.open_issues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          </>
        ) : null;
      case 'attendees':
        return minutes.attendees.length > 0 ? (
          <>
            <h3 style={heading}>{t('present')}</h3>
            <ul style={list}>
              {minutes.attendees.map((attendee, index) => {
                const details = attendeeDetails(attendee, ', ');
                return <li key={index}>{details ? `${attendee.name} — ${details}` : attendee.name}</li>;
              })}
            </ul>
          </>
        ) : null;
      case 'participants':
        return Object.keys(minutes.participants).length > 0 ? (
          <>
            <h3 style={heading}>{t('participants')}</h3>
            <ul style={list}>
              {Object.entries(minutes.participants).map(([speaker, participant]) => (
                <li key={speaker}>
                  <strong>{speaker}</strong> — {participant.role}
                  {participant.name && ` (${participant.name})`}
                  {participant.seconds > 0 && ` · ${minSec(participant.seconds)}`}
                </li>
              ))}
            </ul>
          </>
        ) : null;
      case 'warnings':
        return minutes.warnings.length > 0 ? (
          <>
            <h3 style={heading}>{t('verification')}</h3>
            <ul style={{ ...list, color: '#7a4b00' }}>
              {minutes.warnings.map((warning, index) => (
                <li key={index}>{withoutTime(warning)}</li>
              ))}
            </ul>
          </>
        ) : null;
    }
  };

  return (
    <div className="minutes-page" style={page} lang={language}>
      <p style={{ margin: '0 0 6px', fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: muted }}>
        {t(`meetingLabel.${meetingType}`)} · {t('minutes')}
      </p>
      <h2 style={{ margin: '0 0 8px', fontSize: 22, lineHeight: 1.3 }}>
        {minutes.title || meeting?.title || t('defaultTitle')}
      </h2>
      {meta && <p style={{ margin: '0 0 20px', fontSize: 13, color: muted }}>{meta.filter(Boolean).join(' · ')}</p>}
      {layout.sections
        .filter((item) => item.enabled)
        .map((item) => {
          const content = section(item.key);
          return (
            content && (
              <section key={item.key} data-focus={item.key} style={mark(item.key)}>
                {content}
              </section>
            )
          );
        })}
    </div>
  );
});
