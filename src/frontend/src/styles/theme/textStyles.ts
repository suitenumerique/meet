import { defineTextStyles } from '@pandacss/dev'

/*
 * Font sizes and weights come from the tokens of the La Suite UI kit. Mind that
 * our headings are smaller than the kit's: our h1 has the size of its h3, our
 * h2 of its h5 and our h3 of its h6.
 */
export const textStyles = defineTextStyles({
  display: {
    value: {
      fontSize: 'xs-alt',
      lineHeight: '2rem',
      fontWeight: 'bold',
    },
  },
  h1: {
    value: {
      fontSize: 'h3',
      lineHeight: '2rem',
      fontWeight: 'bold',
    },
  },
  h2: {
    value: {
      fontSize: 'h5',
      lineHeight: '1.75rem',
      fontWeight: 'bold',
    },
  },
  h3: {
    value: {
      fontSize: 'h6',
      lineHeight: '1.75rem',
    },
  },
  body: {
    value: {
      fontSize: 'md',
      lineHeight: '1.5',
    },
  },
  sm: {
    value: {
      fontSize: 'sm',
      lineHeight: '1.25rem',
    },
  },
  xs: {
    value: {
      fontSize: '0.825rem',
      lineHeight: '1.15rem',
    },
  },
  badge: {
    value: {
      fontSize: 'xs',
      lineHeight: '1rem',
    },
  },
})
