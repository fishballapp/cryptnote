import { AlertDialog as BaseAlertDialog } from '@base-ui/react/alert-dialog';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { XIcon } from '@phosphor-icons/react';
import { cn } from 'cn';
import type { ReactNode } from 'react';
import { Button } from './Button.tsx';

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-overlay transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <BaseDialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
          <BaseDialog.Popup
            className={cn(
              'relative flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface-raised shadow-float outline-none transition-[transform,opacity] duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0',
              className,
            )}
          >
            <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="space-y-0.5">
                <BaseDialog.Title className="text-base font-semibold tracking-tight text-foreground">
                  {title}
                </BaseDialog.Title>
                {description !== undefined ? (
                  <BaseDialog.Description className="text-xs text-muted">
                    {description}
                  </BaseDialog.Description>
                ) : null}
              </div>
              <BaseDialog.Close
                aria-label="Close dialog"
                className="-mr-1 -mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-sunken hover:text-foreground"
              >
                <XIcon className="size-4" aria-hidden="true" />
              </BaseDialog.Close>
            </header>
            <div className="overflow-y-auto px-5 py-4">{children}</div>
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly tone?: 'danger' | 'primary';
  readonly onConfirm: () => void;
}) {
  return (
    <BaseAlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseAlertDialog.Portal>
        <BaseAlertDialog.Backdrop className="fixed inset-0 z-40 bg-overlay transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <BaseAlertDialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <BaseAlertDialog.Popup className="w-full max-w-sm rounded-xl border border-border bg-surface-raised p-5 shadow-float outline-none transition-[transform,opacity] duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
            <BaseAlertDialog.Title className="text-base font-semibold text-foreground">
              {title}
            </BaseAlertDialog.Title>
            <BaseAlertDialog.Description className="mt-1.5 text-sm leading-relaxed text-muted">
              {description}
            </BaseAlertDialog.Description>
            <div className="mt-5 flex items-center justify-end gap-2">
              <BaseAlertDialog.Close render={<Button variant="secondary" size="sm" />}>
                {cancelLabel}
              </BaseAlertDialog.Close>
              <Button
                variant={tone === 'danger' ? 'danger-fill' : 'primary'}
                size="sm"
                onClick={() => {
                  onConfirm();
                  onOpenChange(false);
                }}
              >
                {confirmLabel}
              </Button>
            </div>
          </BaseAlertDialog.Popup>
        </BaseAlertDialog.Viewport>
      </BaseAlertDialog.Portal>
    </BaseAlertDialog.Root>
  );
}
