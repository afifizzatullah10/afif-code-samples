import { Button } from '@/components/ui/button'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import {
  downloadPdf,
  downloadSectionsCsv,
  downloadSectionsXlsx,
  type ExportSection,
  type PdfDocument,
} from '@/lib/tabExports'

interface ExportButtonsProps {
  /** Called each time a download is triggered to (re)build the sections. */
  getSections: () => ExportSection[]
  /** Optional PDF builder. If provided, a PDF button is rendered. */
  getPdf?: () => PdfDocument
  /** Base filename (no extension). */
  filename: string
  disabled?: boolean
  /** Optional label prefix, e.g. "Export" — keeps buttons narrow by default. */
  showLabelPrefix?: boolean
  className?: string
}

export function ExportButtons({
  getSections,
  getPdf,
  filename,
  disabled,
  showLabelPrefix,
  className,
}: ExportButtonsProps) {
  const handleCsv = () => {
    downloadSectionsCsv(filename, getSections())
  }

  const handleXlsx = async () => {
    await downloadSectionsXlsx(filename, getSections())
  }

  const handlePdf = async () => {
    if (!getPdf) return
    await downloadPdf(filename, getPdf())
  }

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={handleCsv}
        disabled={disabled}
      >
        <Download className="h-3.5 w-3.5" />
        {showLabelPrefix ? 'Export CSV' : 'CSV'}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => void handleXlsx()}
        disabled={disabled}
      >
        <FileSpreadsheet className="h-3.5 w-3.5" />
        {showLabelPrefix ? 'Export Excel' : 'Excel'}
      </Button>
      {getPdf && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => void handlePdf()}
          disabled={disabled}
        >
          <FileText className="h-3.5 w-3.5" />
          {showLabelPrefix ? 'Export PDF' : 'PDF'}
        </Button>
      )}
    </div>
  )
}
