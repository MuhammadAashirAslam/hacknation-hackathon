'use client'

import { Toaster as Sonner, ToasterProps } from 'sonner'

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="bottom-right"
      style={
        {
          '--normal-bg': '#fffbf3',
          '--normal-text': '#2a1c12',
          '--normal-border': 'rgba(110, 94, 84, 0.35)',
          '--success-bg': '#fffbf3',
          '--success-text': '#3f6a3a',
          '--success-border': 'rgba(63, 106, 58, 0.4)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
