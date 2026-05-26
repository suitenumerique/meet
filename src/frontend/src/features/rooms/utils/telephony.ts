export function formatPinCode(pinCode?: string) {
  return pinCode && `${pinCode.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')}#`
}
