import { CountryCode, parsePhoneNumberWithError } from 'libphonenumber-js'

export const parseConfigPhoneNumber = (
  rawPhoneNumber?: string,
  defaultCountry?: string
) => {
  if (!rawPhoneNumber || !defaultCountry) {
    return null
  }
  try {
    return parsePhoneNumberWithError(
      rawPhoneNumber,
      defaultCountry as CountryCode
    )
  } catch (error) {
    console.warn('Invalid phone number format:', rawPhoneNumber, error)
    return null
  }
}

export function formatPinCode(pinCode?: string) {
  return pinCode && `${pinCode.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')}#`
}
