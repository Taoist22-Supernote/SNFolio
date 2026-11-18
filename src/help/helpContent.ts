/**
 * The single source for SNFolio's user guide (CT, 2026-11-17).
 *
 * The in-app Guide renders this directly, and scripts/build-manual.js renders the
 * same content into a printable manual, so the two cannot drift apart. When a feature
 * changes, update it here and nowhere else. Same shape as sn-flashcards' and Atoms'
 * guides.
 *
 * Pages are written by hand rather than split automatically: e-ink redraws badly while
 * scrolling, so each page is kept short enough to fit on a Nomad without scrolling.
 * Aim for roughly 150 words a page. This file has no imports, so the manual script can
 * transpile it on its own.
 */

export const HELP_VERSION = '0.1.36';

export type HelpBlock =
  | { kind: 'para'; text: string }
  /** Numbered, in order. */
  | { kind: 'steps'; items: string[] }
  /** Unordered. A "Label — text" item is shown with the label emphasised. */
  | { kind: 'bullets'; items: string[] }
  /** A boxed aside, such as a tip or a warning. */
  | { kind: 'note'; label: string; text: string }
  | { kind: 'table'; headers: [string, string]; rows: [string, string][] };

export type HelpPage = {
  /** Shown above the page's blocks. Omit to use only the topic title. */
  heading?: string;
  blocks: HelpBlock[];
};

export type HelpTopicId =
  | 'quick-start'
  | 'getting-around'
  | 'day-planner'
  | 'adding'
  | 'work-time'
  | 'plan-steps'
  | 'para'
  | 'classes'
  | 'notes'
  | 'calendars'
  | 'weekly-review'
  | 'atoms'
  | 'backup'
  | 'troubleshooting';

export type HelpTopic = {
  id: HelpTopicId;
  title: string;
  /** One line under the title in the contents list. */
  summary: string;
  pages: HelpPage[];
};

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'quick-start',
    title: 'Quick Start',
    summary: 'What SNFolio does, and a first day',
    pages: [
      {
        blocks: [
          {
            kind: 'para',
            text: 'SNFolio is a planner on your Supernote: your calendar, your tasks, the time you set aside to do them, and the notes and files for each class or project, in one place. It works without an online account.',
          },
          {
            kind: 'steps',
            items: [
              'Open SNFolio from the toolbar. It opens on the Day Planner for today.',
              'In Tasks & Deliverables, tap + Add Task, give it a title and a due date, and save.',
              'Tap Plan on the task and choose when you will work on it. A block appears on the schedule.',
              'When you have done the work, tick the block.',
            ],
          },
          {
            kind: 'note',
            label: 'Due versus planned',
            text: 'A due date says when something is owed. A planned session says when you will do it. Planning the sessions is what stops work piling up at the end.',
          },
        ],
      },
    ],
  },
  {
    id: 'getting-around',
    title: 'Getting Around',
    summary: 'The four views and what the markers mean',
    pages: [
      {
        blocks: [
          {
            kind: 'bullets',
            items: [
              'Calendar ▾ — Month View or Week View.',
              'Day ▾ — the Day Planner, or the Weekly Review.',
              'PARA — your Projects, Areas, Resources and Archive.',
              'Tasks — every task in one place. Show picks Open, Today, Upcoming, Done or All; Group by arranges them.',
              '‹ Prev, Today, Next › — move by a month, a week or a day, whichever the view shows.',
              '⚙ — Sync Now, Connections & Settings, and this Guide.',
            ],
          },
          {
            kind: 'table',
            headers: ['Marker', 'Meaning'],
            rows: [
              ['C', 'A class: an event marked Class, or a task in a Class Project'],
              ['M', 'An event marked Meeting'],
              ['[N] / [PDF]', 'A note or a PDF is linked'],
              ['D', 'Month View: the day has a journal note'],
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'day-planner',
    title: 'The Day Planner',
    summary: 'Your day: schedule, focus, tasks',
    pages: [
      {
        blocks: [
          {
            kind: 'bullets',
            items: [
              'Daily Journal — opens or creates the day’s journal note.',
              'Focus for this day — your top three priorities.',
              'Schedule — events and planned work blocks on an hour grid. + Event adds an event.',
              'Tasks & Deliverables — what is due today, upcoming, with no date, and past due. + Add Task adds one.',
              'Projects needing attention — Projects with overdue or near work, with their progress.',
              'Tomorrow’s Schedule — a look ahead.',
            ],
          },
          {
            kind: 'para',
            text: 'Tap a task’s title to edit it, its box to tick it off, and Plan to put time for it on the schedule.',
          },
          {
            kind: 'note',
            label: 'On a Nomad',
            text: 'Sections fold, with shortcuts at the top to jump to each. They remember what you leave open.',
          },
        ],
      },
    ],
  },
  {
    id: 'adding',
    title: 'Adding Tasks and Events',
    summary: 'Forms, subtasks and handwriting',
    pages: [
      {
        blocks: [
          {
            kind: 'bullets',
            items: [
              'A task — + Add Task in the Day Planner or a Project. Give it a due date, priority, and its Project or Area.',
              'An event — + Event on the schedule, or tap a day in the calendar.',
              'Subtasks — edit a task and use Add a subtask under Subtasks. Each step can have its own due date. Ticking the task ticks its subtasks.',
              'From handwriting — write the date, time and title on one line in any note, such as 11-20-2026 10:00A Lab review, lasso it, and tap Add to Calendar. Check what was read before saving.',
            ],
          },
          {
            kind: 'note',
            label: 'No date found?',
            text: 'Handwriting without a date or time becomes an undated task rather than a guessed appointment.',
          },
        ],
      },
    ],
  },
  {
    id: 'work-time',
    title: 'Work Time on the Schedule',
    summary: 'Plan sessions, move them, tick them off',
    pages: [
      {
        blocks: [
          {
            kind: 'steps',
            items: [
              'Tap Plan on a task. The planner opens on the first free slot.',
              'Choose a day, a start time and a length. If it runs into an event or another session, the planner says so; you can still save.',
              'Tap Put on schedule. The task appears as a dashed block, without changing its due date.',
            ],
          },
          {
            kind: 'para',
            text: 'A task can have several sessions, such as an essay over three sittings: once it has one, its button reads + Plan, which adds another. Each session is its own block.',
          },
          {
            kind: 'table',
            headers: ['On a block', 'Means'],
            rows: [
              ['▶ NOW (black)', 'The session you should be on now'],
              ['MISSED', 'Its time passed and it is not ticked: tap ⏱ Replan'],
              ['CLASH', 'It overlaps an event or another session'],
            ],
          },
        ],
      },
      {
        heading: 'Moving and finishing',
        blocks: [
          {
            kind: 'bullets',
            items: [
              '⏱ Move — opens the planner on that session to change its time. Take off schedule is in there too.',
              '✕ — takes the session off the schedule.',
              '📝 Create Note / 📂 Open Note — goes straight to the work.',
              'The box — ticks that session only. When you tick the last one planned, SNFolio asks whether the task is finished: Yes ticks it; Not yet keeps it open.',
            ],
          },
          {
            kind: 'note',
            label: 'Short blocks',
            text: 'A 30-minute block has no room for buttons, so its title line ends with ⏱ and its note icon instead.',
          },
        ],
      },
    ],
  },
  {
    id: 'plan-steps',
    title: 'Plan from Steps',
    summary: 'Break an assignment into dated steps',
    pages: [
      {
        blocks: [
          {
            kind: 'para',
            text: 'Instead of one task until the last day, an assignment can become a set of steps, each with its own day and session.',
          },
          {
            kind: 'steps',
            items: [
              'Add the assignment as a task with its real due date, and save it.',
              'Open it again and tap 📋 Plan from steps… under Subtasks.',
              'Choose Paper or project, Discussion post, or Reading.',
              'Check the plan: write over a name to rename it, ‹ › to move it a day, ✕ to drop it.',
              'Tap Add. Each step becomes a subtask due on its day, in the same Project, with a session in that day’s first free slot.',
            ],
          },
          {
            kind: 'para',
            text: 'Steps are spread from today to the day before it is due, so the last one lands with a day to spare.',
          },
          {
            kind: 'note',
            label: 'One assignment, one task',
            text: 'Make each assignment its own task with its own deadline. The class Project holds the week together.',
          },
        ],
      },
    ],
  },
  {
    id: 'para',
    title: 'Projects and PARA',
    summary: 'Projects, Areas, Resources and Archive',
    pages: [
      {
        blocks: [
          {
            kind: 'bullets',
            items: [
              'Projects — work with an end: a class, a paper, a client job. Each has a due date, tasks, events and a folder of files.',
              'Areas — ongoing responsibilities, such as Home or Health.',
              'Resources — reference topics backed by a folder.',
              'Archive — finished or set-aside items. Each can be restored.',
            ],
          },
          {
            kind: 'para',
            text: 'Tap + New Project in PARA, or + Existing Folder… to use a folder you already have. Choose a task’s or event’s Project in its form to file it there.',
          },
        ],
      },
      {
        heading: 'Inside a Project',
        blocks: [
          {
            kind: 'bullets',
            items: [
              '📅 Upcoming — its next events.',
              'Actionable Deliverables — what is still to do, soonest first. + Add Task adds one.',
              'Completed Deliverables — what is done.',
              '📁 Project Files — the files in its folder, with + New Note. Each file has Open, Move…, Rename… and Delete….',
              'Project settings — category, weeks, notes and auto-filing.',
              'Project Actions… — Mark Complete, Archive, Move to Areas, Delete. Each can be undone from the message that follows.',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'classes',
    title: 'Setting Up a Class',
    summary: 'Weeks, week folders, and filing the course calendar',
    pages: [
      {
        blocks: [
          {
            kind: 'steps',
            items: [
              'In PARA, tap + New Project and open it.',
              'Tap 📅 Set a due date: the day the class ends.',
              'Tap Project settings … ▾ Change and choose the category Class.',
              'Under Weeks, set the start date and check the Week 1 dates. Pick another weekday under Weeks run if your weeks start differently.',
              'Tap 📁 Create Week Folders.',
              'Under Auto-file from calendars, enter the course code, such as PSY215, and tap Save.',
              'Under Treat as deadlines, enter words like Due, Assignment, and tap Save. Those calendar items become tasks.',
              'Tap Close.',
            ],
          },
        ],
      },
      {
        heading: 'This week in the class',
        blocks: [
          {
            kind: 'para',
            text: 'At the top of the Project a line shows where the class is, such as 📆 Week 4 of 9 · Nov 16 – 22 · 3 due · 5 sessions planned.',
          },
          {
            kind: 'para',
            text: 'Tap it to see the week: one row per task per day, such as Wed, Nov 18 · ⏱ 1:00 PM · due. Tap a row to open the task.',
          },
          {
            kind: 'bullets',
            items: [
              'Week folders — Project Files lists last, this and next week first; the rest are under All weeks. Notes for the class’s events go into the right week.',
              'Calendar items as tasks — open a calendar item and choose Make it a task, New task for it, or Attach an existing task. The calendar itself is never changed.',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'notes',
    title: 'Notes and Files',
    summary: 'Create, link and open notes for your work',
    pages: [
      {
        blocks: [
          {
            kind: 'bullets',
            items: [
              'Create Note — on an event or task. Check the name, folder and template, and the note opens ready to write.',
              'Link Note / PDF — links a note or PDF you already have.',
              'Open Note / Open PDF — opens it; Change Link and Unlink are beside it.',
              'Recurring events — a series can keep one notebook with a page per session, or a note per session. Choose per Project.',
              'Templates — a template can be a background image or a whole .note, copied with its writing and layers. Set them in ⚙ → Connections & Settings → Notes & Storage.',
            ],
          },
          {
            kind: 'note',
            label: 'SNFolio never deletes notes',
            text: 'Deleting an event or task only unlinks its note. The note stays in its folder.',
          },
        ],
      },
    ],
  },
  {
    id: 'calendars',
    title: 'Calendars and Sync',
    summary: 'Feeds, iCloud and other CalDAV accounts',
    pages: [
      {
        blocks: [
          {
            kind: 'bullets',
            items: [
              'Calendar feeds — paste a calendar’s private .ics address in ⚙ → Connections & Settings, and tap Subscribe. Google, Outlook, Apple, Canvas, Brightspace and Moodle all offer one. Feeds are read-only.',
              'iCloud or another CalDAV account — connect it in Calendars & Sync for two-way events.',
              'Task account — a separate CalDAV account that supports tasks can sync them too. iCloud Reminders cannot be reached this way.',
              'Sync Now — in the ⚙ menu: sends your changes, then reads new ones.',
            ],
          },
          {
            kind: 'para',
            text: 'Planned work sessions stay on the device: sync keeps them but does not send them to the server.',
          },
          {
            kind: 'note',
            label: 'Typing long addresses',
            text: 'Put feed addresses in a .txt file, copy it to the Supernote, and use Import Setup or Calendar File. Delete the file afterwards.',
          },
        ],
      },
    ],
  },
  {
    id: 'weekly-review',
    title: 'Weekly Review',
    summary: 'Look back, look ahead, replan',
    pages: [
      {
        blocks: [
          {
            kind: 'para',
            text: 'Open Day ▾ → Weekly Review once a week, such as Sunday evening.',
          },
          {
            kind: 'bullets',
            items: [
              'Summary — completed, remaining, overdue and upcoming work.',
              'Work Time — the week’s planned, done, missed and still-ahead hours, a row per Project, and each missed session with Replan. Done is the planned length of ticked sessions, not time measured.',
              'This Week by Project — each Project’s tasks due, events and notes, with its week number.',
              'Weekly note — opens or creates a handwritten note for the week.',
            ],
          },
          {
            kind: 'note',
            label: 'A weekly routine',
            text: 'Look at next week’s deadlines in each class. Use Plan from steps on new assignments, and Replan anything missed.',
          },
        ],
      },
    ],
  },
  {
    id: 'atoms',
    title: 'SNFolio and Atoms',
    summary: 'The Resurface strip and Inbox reminder',
    pages: [
      {
        blocks: [
          {
            kind: 'para',
            text: 'If you use the Atoms plugin, a one-line 💡 Resurface strip sits at the top of the Day Planner. Tap it for three ideas due to come back.',
          },
          {
            kind: 'bullets',
            items: [
              'Open Source — opens the idea’s page.',
              'Not Now — back in a week.',
              'Don’t Resurface — never brings it back.',
            ],
          },
          {
            kind: 'para',
            text: 'When fleeting atoms wait in Atoms’ Inbox, the strip reminds you of one, a different one each time you open SNFolio. Process them in Atoms. Ideas marked Needs practice in Atoms come back sooner.',
          },
          {
            kind: 'para',
            text: 'To hide the strip, use ⚙ → Connections & Settings → App & View → Atoms.',
          },
        ],
      },
    ],
  },
  {
    id: 'backup',
    title: 'Backup and Restore',
    summary: 'Daily backups and restoring your workspace',
    pages: [
      {
        blocks: [
          {
            kind: 'para',
            text: 'Open ⚙ → Connections & Settings → Help & Setup → Workspace Backup & Restore….',
          },
          {
            kind: 'bullets',
            items: [
              'Automatic daily backup — on unless you switch it off. A file for each weekday in Export/SNFolio Backups, so the last seven days are kept.',
              'Create Backup — saves one now.',
              'Choose Backup to Restore… — lists your backups. Restoring first saves a safety backup of what you have now.',
              'Reset SNFolio… — empties SNFolio after a backup. Notes and folders are not touched.',
            ],
          },
          {
            kind: 'note',
            label: 'What a backup holds',
            text: 'Tasks, calendars, PARA, settings and note links, not the notes themselves, and not passwords. After a restore, syncing waits until you tap Allow Reconnection.',
          },
        ],
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    summary: 'Common problems and what to check',
    pages: [
      {
        blocks: [
          {
            kind: 'table',
            headers: ['Problem', 'What to check'],
            rows: [
              ['Sync does nothing', 'After a restore, tap Allow Reconnection in Help & Setup, then reconnect.'],
              ['A course’s items are not filed', 'Check the course code in Auto-file, or file the whole calendar under the Project.'],
              ['A note will not open', 'It may have been moved in Files. Use Change Link… on the event or task.'],
              ['A block has no buttons', 'It is short: use the ⏱ and note icons on its title line.'],
              ['The 💡 strip is missing', 'Open Atoms once so it shares its list, or check App & View → Atoms.'],
              ['Handwriting read the wrong time', 'Write the date, time and title on one line.'],
            ],
          },
        ],
      },
    ],
  },
];

export const findTopic = (id: HelpTopicId): HelpTopic | undefined =>
  HELP_TOPICS.find(topic => topic.id === id);

/** Splits "Label — text" into its parts, for emphasis. Returns null if there is no label. */
export const splitLabel = (item: string): { label: string; text: string } | null => {
  const match = /^(.{1,40}?) — (.+)$/.exec(item);
  return match ? { label: match[1], text: match[2] } : null;
};
