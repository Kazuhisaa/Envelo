type Props = { size?: 'header' | 'login' | 'hero' | 'display' }

const LOGO_SRC = '/logoCreator_imagetologo%20(1).png'

export function BrandLogo({ size = 'header' }: Props) {
  return (
    <span className={`brand-logo brand-logo-${size}`} aria-hidden="true">
      <img src={LOGO_SRC} alt="" />
    </span>
  )
}
