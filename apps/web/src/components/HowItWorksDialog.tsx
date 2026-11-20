import { ArrowSquareOutIcon } from '@phosphor-icons/react';
import { Modal } from './ui/Dialog.tsx';

export function HowItWorksDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="How CryptNote works"
      description="Zero-knowledge encrypted notepad, open source under MIT."
    >
      <div className="space-y-4 text-sm leading-relaxed text-foreground">
        <section className="space-y-1">
          <h3 className="font-semibold text-foreground">Your title is the only key</h3>
          <p className="text-muted">
            Titles are case-sensitive and never leave your browser or appear in the URL. Your
            browser stretches the title with PBKDF2-HMAC-SHA256, then derives two separate HKDF
            values: an opaque lookup ID sent to the server, and an AES-256-GCM key used strictly on
            your device.
          </p>
        </section>

        <section className="space-y-1">
          <h3 className="font-semibold text-foreground">Public vs. private titles</h3>
          <p className="text-muted">
            Common words act as shared public notepads anyone can open and edit. For private notes,
            use a long passphrase or generate a random title. If you forget a title, the entry
            cannot be recovered.
          </p>
        </section>

        <section className="space-y-1">
          <h3 className="font-semibold text-foreground">Limits & abuse protection</h3>
          <p className="text-muted">
            Each entry holds up to 256 KB of encrypted data across its Note, Checklist, Bookmarks,
            Drawing, and Code tabs. Every save solves a brief adaptive Proof-of-Work challenge in a
            background thread so the service stays free without accounts or CAPTCHAs.
          </p>
        </section>

        <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
          <span>MIT Licensed · No accounts, no tracking</span>
          <a
            href="https://github.com/fishballapp/cryptnote"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-accent underline underline-offset-2 hover:opacity-85"
          >
            Source on GitHub
            <ArrowSquareOutIcon className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </Modal>
  );
}
