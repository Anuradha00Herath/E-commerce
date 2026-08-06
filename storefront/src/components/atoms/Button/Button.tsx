import { cn } from "@/lib/utils"

import Spinner from "@/icons/spinner"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "filled" | "tonal" | "text" | "destructive"
  size?: "small" | "large"
  loading?: boolean
  "data-testid"?: string
}

export function Button({
  children,
  variant = "filled",
  size = "small",
  loading = false,
  disabled = false,
  className,
  "data-testid": dataTestId,
  ...props
}: ButtonProps) {
  const baseClasses =
    "text-md button-text rounded-sm disabled:bg-disabled disabled:text-disabled dark:bg-action-tertiary dark:hover:bg-action-tertiary-hover dark:active:bg-action-tertiary-pressed dark:disabled:bg-disabled"

  const variantClasses = {
    // Primary: solid green fill, white text (bg-action/text-action-on-primary
    // resolve to #16A34A / white via colors.css — hover resolves to #15803D).
    filled: `bg-action text-action-on-primary hover:bg-action-hover active:bg-action-pressed ${
      loading && "button-text-filled"
    }`,
    // Secondary: white fill, 1px hairline border, dark text — never a tinted
    // fill, per the "restrained, white/neutral-dominant" design spec.
    tonal:
      "bg-primary border border-primary hover:border-hover active:border-secondary text-primary",
    text: "bg-primary dark:bg-primary hover:bg-action-secondary-hover active:bg-action-secondary-pressed text-primary",
    destructive: `text-negative-on-primary bg-negative hover:bg-negative-hover active:bg-negative-pressed ${
      loading && "button-text-filled"
    }`,
  }

  const sizeClasses = {
    small: "px-[16px] py-[8px]",
    large: "px-[24px] py-[8px]",
  }

  return (
    <button
      disabled={disabled}
      className={cn(
        variantClasses[variant],
        sizeClasses[size],
        baseClasses,
        className
      )}
      data-testid={dataTestId ?? `button-${variant}-${size}`}
      {...props}
    >
      {loading ? <Spinner /> : children}
    </button>
  )
}
