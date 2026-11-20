import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { Field as BaseField } from '@base-ui/react/field';
import { Input as BaseInput } from '@base-ui/react/input';
import { Menu as BaseMenu } from '@base-ui/react/menu';
import { Meter as BaseMeter } from '@base-ui/react/meter';
import { Select as BaseSelect } from '@base-ui/react/select';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { Toggle as BaseToggle } from '@base-ui/react/toggle';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import { CaretDownIcon, CheckIcon } from '@phosphor-icons/react';
import { cn } from 'cn';
import type { ReactElement, ReactNode } from 'react';

// --- Checkbox ---
export function Checkbox({
  checked,
  onCheckedChange,
  ariaLabel,
  className,
}: {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly ariaLabel: string;
  readonly className?: string;
}) {
  return (
    <BaseCheckbox.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex size-4.5 shrink-0 items-center justify-center rounded border border-border-strong bg-surface transition-colors hover:border-accent data-[checked]:border-accent data-[checked]:bg-accent data-[checked]:text-accent-foreground',
        className,
      )}
    >
      <BaseCheckbox.Indicator className="flex items-center justify-center">
        <CheckIcon className="size-3" weight="bold" aria-hidden="true" />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}

// --- Menu ---
export const MenuRoot = BaseMenu.Root;
export const MenuTrigger = BaseMenu.Trigger;

export function MenuContent({
  children,
  align = 'start',
  sideOffset = 6,
  className,
}: {
  readonly children: ReactNode;
  readonly align?: 'start' | 'center' | 'end';
  readonly sideOffset?: number;
  readonly className?: string;
}) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner align={align} sideOffset={sideOffset} className="z-50 outline-none">
        <BaseMenu.Popup
          className={cn(
            'min-w-48 origin-[var(--transform-origin)] rounded-xl border border-border bg-surface-raised p-1 shadow-float outline-none transition-[transform,opacity] duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0',
            className,
          )}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export function MenuItem({
  children,
  onClick,
  disabled,
  tone = 'default',
  className,
}: {
  readonly children: ReactNode;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly tone?: 'default' | 'danger';
  readonly className?: string;
}) {
  return (
    <BaseMenu.Item
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm outline-none data-[disabled]:opacity-40',
        tone === 'danger'
          ? 'text-danger data-[highlighted]:bg-danger-soft'
          : 'text-foreground data-[highlighted]:bg-surface-sunken',
        className,
      )}
    >
      {children}
    </BaseMenu.Item>
  );
}

// --- Select ---
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
}: {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly options: ReadonlyArray<{ readonly value: T; readonly label: string }>;
  readonly ariaLabel: string;
  readonly className?: string;
}) {
  const currentLabel = options.find(option => option.value === value)?.label ?? value;
  return (
    <BaseSelect.Root
      value={value}
      onValueChange={next => {
        if (next !== null) onValueChange(next as T);
      }}
    >
      <BaseSelect.Trigger
        aria-label={ariaLabel}
        className={cn(
          'inline-flex h-8 items-center justify-between gap-2 rounded-lg border border-border bg-surface px-2.5 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-sunken',
          className,
        )}
      >
        <BaseSelect.Value>{currentLabel}</BaseSelect.Value>
        <BaseSelect.Icon className="text-muted">
          <CaretDownIcon className="size-3.5" aria-hidden="true" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner alignItemWithTrigger={false} sideOffset={6} className="z-50">
          <BaseSelect.Popup className="max-h-64 min-w-36 overflow-y-auto rounded-xl border border-border bg-surface-raised p-1 shadow-float outline-none">
            {options.map(option => (
              <BaseSelect.Item
                key={option.value}
                value={option.value}
                className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none data-[highlighted]:bg-surface-sunken"
              >
                <span className="inline-flex size-3.5 items-center justify-center text-accent">
                  <BaseSelect.ItemIndicator>
                    <CheckIcon className="size-3" weight="bold" aria-hidden="true" />
                  </BaseSelect.ItemIndicator>
                </span>
                <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
              </BaseSelect.Item>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

// --- Tabs ---
export const TabsRoot = BaseTabs.Root;
export const TabsList = BaseTabs.List;
export const TabTrigger = BaseTabs.Tab;
export const TabPanel = BaseTabs.Panel;

// --- Toggle ---
export function ToggleButton({
  pressed,
  onPressedChange,
  ariaLabel,
  children,
  className,
}: {
  readonly pressed: boolean;
  readonly onPressedChange: (pressed: boolean) => void;
  readonly ariaLabel: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <BaseToggle
      pressed={pressed}
      onPressedChange={onPressedChange}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-transparent px-2 text-xs font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-foreground data-[pressed]:border-border data-[pressed]:bg-accent-soft data-[pressed]:text-accent',
        className,
      )}
    >
      {children}
    </BaseToggle>
  );
}

// --- Tooltip ---
export const TooltipProvider = BaseTooltip.Provider;

export function Tooltip({
  content,
  children,
  side = 'bottom',
}: {
  readonly content: ReactNode;
  readonly children: ReactElement<Record<string, unknown>>;
  readonly side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={6} className="z-50">
          <BaseTooltip.Popup className="max-w-xs rounded-lg border border-border bg-foreground px-2.5 py-1 text-xs font-medium text-background shadow-float transition-opacity duration-100 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}

// --- Field & Input ---
export const FieldRoot = BaseField.Root;
export const FieldLabel = BaseField.Label;
export const FieldControl = BaseField.Control;
export const FieldError = BaseField.Error;
export const Input = BaseInput;

// --- Meter ---
export function SizeMeter({
  value,
  max,
  tone,
}: {
  readonly value: number;
  readonly max: number;
  readonly tone: 'normal' | 'warn' | 'danger';
}) {
  const clamped = Math.min(value, max);
  return (
    <BaseMeter.Root value={clamped} min={0} max={max} aria-label="Encrypted payload size">
      <BaseMeter.Track className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-sunken">
        <BaseMeter.Indicator
          className={cn(
            'h-full rounded-full transition-[width] duration-150',
            tone === 'danger' && 'bg-danger',
            tone === 'warn' && 'bg-warning',
            tone === 'normal' && 'bg-accent',
          )}
        />
      </BaseMeter.Track>
    </BaseMeter.Root>
  );
}
