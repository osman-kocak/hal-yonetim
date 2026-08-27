// Boş durum kutusu.
//
// icon HEM emoji string HEM de bir ikon component'i (lucide gibi) kabul eder.
// Eskiden yalnız string basıyordu (`<span>{icon}</span>`); component geçirilince
// React "Objects are not valid as a React child" (#31) ile TÜM SAYFAYI
// çökertiyordu — build ve lint bunu yakalamıyor, yalnız tarayıcıda patlıyor.
// Sözleşmeyi geniş tutmak bu hatayı bir daha imkânsız kılıyor.
export function EmptyState({ icon = '📭', title, description, action }) {
  // Fonksiyon ya da forwardRef nesnesi → component olarak render et.
  const isComponent = typeof icon === 'function'
    || (typeof icon === 'object' && icon !== null && '$$typeof' in icon)
  const Icon = isComponent ? icon : null

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {Icon
        ? <Icon className="w-12 h-12 mb-4 text-text-muted" strokeWidth={1.5} />
        : <span className="text-5xl mb-4">{icon}</span>}
      <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
      {description && <p className="text-text-muted text-sm mb-6 max-w-sm">{description}</p>}
      {action}
    </div>
  )
}
