import { styled } from '@/styled-system/jsx'

export const StyledToastContainer = styled('div', {
  base: {
    margin: 0.5,
    boxShadow:
      'rgba(0, 0, 0, 0.5) 0px 4px 8px 0px, rgba(0, 0, 0, 0.3) 0px 6px 20px 4px',
    backgroundColor: 'greyscale.700',
    color: 'white',
    borderRadius: '8px',
    '&[data-entering]': { animation: 'fade 200ms' },
    '&[data-exiting]': { animation: 'fade 150ms reverse ease-in' },
    width: 'fit-content',
    marginLeft: 'auto',
  },
})
