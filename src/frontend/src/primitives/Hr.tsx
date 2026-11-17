import { css } from '@/styled-system/css'

export const Hr = (props: React.HTMLAttributes<HTMLHRElement>) => {
  return (
    <hr
      className={css({
        marginY: 'base',
        borderColor: 'gray.150',
      })}
      {...props}
    />
  )
}
