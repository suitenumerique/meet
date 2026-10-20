import { Children, type ReactNode } from 'react'

interface TranscriptDetailsListProps {
  children: ReactNode
}

export const TranscriptDetailsList = ({
  children,
}: TranscriptDetailsListProps) => (
  <ul
    style={{
      width: '100%',
      listStyle: 'none',
      padding: 0,
      margin: 0,
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    {Children.toArray(children).map((child, index) => (
      <li key={index} style={{ listStyle: 'none' }}>
        {child}
      </li>
    ))}
  </ul>
)
