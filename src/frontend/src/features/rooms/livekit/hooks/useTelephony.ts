import { useConfig } from '@/api/useConfig'

export const useTelephony = () => {
  const { data } = useConfig()

  if (!data?.telephony?.enabled) {
    return {
      enabled: false,
    }
  }

  return {
    enabled: data?.telephony?.enabled,
    country: data?.telephony.default_country,
    internationalPhoneNumber: data?.telephony.international_phone_number,
  }
}
