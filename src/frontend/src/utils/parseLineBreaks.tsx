import { Fragment, ReactNode } from 'react'

export const parseLineBreaks = (text: string): ReactNode[] => {
  const parts = text.split(/(<br\s*\/?>)/gi)

  return parts.map((part, index) => {
    if (part.match(/^<br\s*\/?>$/gi)) {
      return <br key={index} />
    }
    return <Fragment key={index}>{part}</Fragment>
  })
}
