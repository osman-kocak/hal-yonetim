import { useState, useRef, useEffect } from 'react'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { exportToPDF, exportToXLSX } from '@/utils/exportData'

// Generic export butonu. Bir prepare fonksiyonu alır, çağrı yapılınca
// { title, columns, rows, filename } döndürmesini bekler.
// Kullanım:
//   <ExportButton
//     title="Finans Raporu"
//     filename="finans-2026-05-16"
//     prepare={() => ({ columns: [...], rows: [[...]] })}
//   />
export function ExportButton({ title, subtitle, filename, prepare, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function trigger(type) {
    setOpen(false)
    try {
      const data = prepare()
      if (!data || !data.rows?.length) return
      const args = { title, subtitle, filename, ...data }
      if (type === 'pdf') exportToPDF(args)
      else exportToXLSX(args)
    } catch (e) {
      console.error('Export hatası:', e)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-white text-sm font-medium text-text-primary hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Download className="w-4 h-4" />
        <span className="hidden sm:inline">Çıktı Al</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-lg min-w-[160px] z-20 overflow-hidden">
          <button
            type="button"
            onClick={() => trigger('pdf')}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-gray-50"
          >
            <FileText className="w-4 h-4 text-red-600" />
            PDF olarak indir
          </button>
          <button
            type="button"
            onClick={() => trigger('xlsx')}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-gray-50 border-t border-border"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Excel olarak indir
          </button>
        </div>
      )}
    </div>
  )
}
