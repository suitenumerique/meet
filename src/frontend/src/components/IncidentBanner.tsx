import { css } from '@/styled-system/css'
import { RiErrorWarningLine, RiExternalLinkLine } from '@remixicon/react'
import { Text, A } from '@/primitives'
import { useConfig } from '@/api/useConfig'

export const IncidentBanner = () => {
  const { data } = useConfig()

  if (!data?.feedback?.url) return

  return (
    <div
      className={css({
        width: '100%',
        backgroundColor: 'error.900',
        color: 'error.100',
        display: { base: 'none', xs: 'flex' },
        justifyContent: 'center',
        padding: '0.5rem 0',
      })}
    >
      <div
        className={css({
          display: 'inline-flex',
          gap: '0.5rem',
          alignItems: 'center',
        })}
      >
        <RiErrorWarningLine size={20} aria-hidden="true" />
        <Text as="p" variant="sm">
          Incident hébergeur en cours,{' '}
          <span
            className={css({
              display: { base: 'none', sm: 'inline-block' },
            })}
          >
            déploiement d'urgence
          </span>
        </Text>
        <div
          className={css({
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
          })}
        >
          <A
            href={'https://pad.numerique.gouv.fr/s/qcYxMi2nH'}
            target="_blank"
            size="sm"
          >
            En savoir plus
          </A>
          <RiExternalLinkLine size={16} aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
