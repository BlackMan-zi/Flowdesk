import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { listDocuments, downloadDocument } from '../api/documents'
import Card, { CardHeader } from '../components/ui/Card'
import Table from '../components/ui/Table'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import { FileDown } from 'lucide-react'

export default function Documents() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => listDocuments().then(r => r.data)
  })

  const handleDownload = async (doc) => {
    try {
      const res = await downloadDocument(doc.form_instance_id)
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = doc.file_name
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Download failed.')
    }
  }

  const columns = [
    { key: 'reference_number', label: 'Reference' },
    { key: 'file_name', label: 'File' },
    { key: 'file_size', label: 'Size', render: r => r.file_size ? `${Math.round(r.file_size / 1024)} KB` : '—' },
    { key: 'generated_at', label: 'Generated', render: r => fmt(r.generated_at) },
    { key: 'actions', label: '', render: r => (
      <Button size="sm" variant="secondary" onClick={() => handleDownload(r)}>
        <FileDown size={14} /> Download
      </Button>
    )}
  ]

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Documents</h1>
      <Card>
        <CardHeader title="Generated PDFs" subtitle="Completed and approved forms" />
        {isLoading
          ? <div className="flex justify-center py-12"><Spinner /></div>
          : <Table columns={columns} rows={data} emptyMessage="No documents generated yet." />
        }
      </Card>
    </div>
  )
}

function fmt(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
