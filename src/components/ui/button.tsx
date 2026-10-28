import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
const variants = cva('inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-orange-400 disabled:opacity-50', { variants: { variant: { default: 'bg-orange-500 text-black hover:bg-orange-400', outline: 'border border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/[0.07]', ghost: 'text-slate-400 hover:bg-white/[0.05] hover:text-white' }, size: { default: 'px-3 py-2', icon: 'h-9 w-9' } }, defaultVariants: { variant: 'default', size: 'default' } });
export function Button({className,variant,size,asChild=false,...props}: React.ComponentProps<'button'> & VariantProps<typeof variants> & {asChild?:boolean}) { const Comp = asChild ? Slot : 'button'; return <Comp className={twMerge(clsx(variants({variant,size}),className))} {...props}/>; }
