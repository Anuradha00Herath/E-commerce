import { cn } from "@/lib/utils"
import LocalizedClientLink from "@/components/molecules/LocalizedLink/LocalizedLink"

interface NavigationItemProps extends React.ComponentPropsWithoutRef<"a"> {
  active?: boolean
  "data-testid"?: string
}

export const NavigationItem: React.FC<NavigationItemProps> = ({
  children,
  href = "/",
  className,
  active,
  "data-testid": dataTestId,
  ...props
}) => (
  <LocalizedClientLink
    href={href}
    className={cn(
      "label-md px-4 py-3 my-3 md:my-0 flex items-center justify-between text-primary hover:text-action transition-colors",
      active && "text-action font-medium",
      className
    )}
    data-testid={dataTestId ?? 'navigation-item'}
    {...props}
  >
    {children}
  </LocalizedClientLink>
)
