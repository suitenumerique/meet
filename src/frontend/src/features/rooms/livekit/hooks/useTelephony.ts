import { useConfig } from '@/api/useConfig.ts'
import { useMemo } from 'react'
import { parseConfigPhoneNumber } from '../../utils/telephony'

export const useTelephony = () => {
  const { data } = useConfig()

  const parsedPhoneNumber = useMemo(() => {
    return parseConfigPhoneNumber(
      data?.telephony?.phone_number,
      data?.telephony?.default_country
    )
  }, [data?.telephony])

  return {
    enabled: data?.telephony?.enabled && parsedPhoneNumber,
    country: parsedPhoneNumber?.country,
    internationalPhoneNumber: parsedPhoneNumber?.formatInternational(),
  }
}
