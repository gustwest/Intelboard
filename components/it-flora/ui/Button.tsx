import * as React from 'react';
import { cn } from '@/lib/it-flora/utils';

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
    size?: 'default' | 'sm' | 'lg' | 'icon' | 'xs';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'default', size = 'default', ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={cn(
                    'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
                    {
                        'bg-primary text-primary-foreground hover:bg-primary/90': variant === 'default',
                        'bg-destructive text-destructive-foreground hover:bg-destructive/90': variant === 'destructive',
                        'border border-border bg-card hover:bg-accent hover:text-accent-foreground': variant === 'outline',
                        'bg-muted text-foreground hover:bg-muted/80': variant === 'secondary',
                        'hover:bg-accent hover:text-accent-foreground': variant === 'ghost',
                        'text-primary underline-offset-4 hover:underline': variant === 'link',
                        'h-10 px-4 py-2': size === 'default',
                        'h-9 rounded-md px-3': size === 'sm',
                        'h-7 rounded-md px-2 text-xs': size === 'xs',
                        'h-11 rounded-md px-8': size === 'lg',
                        'h-10 w-10': size === 'icon',
                    },
                    className
                )}
                {...props}
            />
        );
    }
);
Button.displayName = 'Button';

export { Button };
