import type { CodeLanguage, TabKind } from '@cryptnote/crypto';
import {
  BookmarkSimpleIcon,
  CheckSquareIcon,
  CodeIcon,
  NotePencilIcon,
  ScribbleLoopIcon,
} from '@phosphor-icons/react';
import type { ComponentType } from 'react';

type TabIcon = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

/** Policy table for the 5 supported entry tab kinds: label, summary, and icon in one place. */
export const TAB_META: Record<
  TabKind,
  {
    readonly label: string;
    readonly summary: string;
    readonly icon: TabIcon;
  }
> = {
  note: {
    label: 'Note',
    summary: 'Plain text writing',
    icon: NotePencilIcon,
  },
  checklist: {
    label: 'Checklist',
    summary: 'Tasks and progress',
    icon: CheckSquareIcon,
  },
  bookmarks: {
    label: 'Bookmarks',
    summary: 'Saved links',
    icon: BookmarkSimpleIcon,
  },
  drawing: {
    label: 'Drawing',
    summary: 'Excalidraw whiteboard',
    icon: ScribbleLoopIcon,
  },
  code: {
    label: 'Code',
    summary: 'Monospace snippet',
    icon: CodeIcon,
  },
};

export const CODE_LANGUAGE_OPTIONS: ReadonlyArray<{
  readonly value: CodeLanguage;
  readonly label: string;
}> = [
  { value: 'plain', label: 'Plain text' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'bash', label: 'Shell / Bash' },
  { value: 'json', label: 'JSON' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'markdown', label: 'Markdown' },
];
