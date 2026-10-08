import {useEffect, useState} from 'react'

export type Theme = 'dark' | 'light' | 'system'

const KEY = 'dotsloth-theme'

function stored(): Theme {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'dark' || value === 'light' ? value : 'system'
  } catch {
    return 'system'
  }
}

/** Light, dark, or follow the system; remembered per browser. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(stored)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.dataset.theme = theme
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      // private mode or blocked storage: the choice just is not remembered
    }
  }, [theme])

  return [theme, setTheme]
}
