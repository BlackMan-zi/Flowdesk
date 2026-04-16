import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listDocuments, downloadDocument } from '../../api/documents'
import { toast } from 'sonner'
import Card, { CardHeader } from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { FileDown } from 'lucide-react'

function fmt(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ObserverDashboard() {
  const [search, setSearch] = useState('')

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => listDocuments().then(r => r.data)
  })

  const filtered = docs.filter(d =>
    !search ||
    d.file_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.reference_number?.toLowerCase().includes(search.toLowerCase())
  )

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
      toast.error('Download failed.')
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Document Library</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Completed and approved forms available to you.</p>
      </div>

      <Input
        placeholder="Search by name or reference…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <Card>
        <CardHeader
          title="Available Documents"
          subtitle={`${filtered.length} document${filtered.length !== 1 ? 's' : ''}`}
        />
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <FileDown size={32} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {search ? 'No documents match your search.' : 'No completed documents available yet.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(doc => (
              <div key={doc.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-destructive/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileDown size={16} className="text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{doc.file_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {doc.reference_number} · {fmt(doc.generated_at)}
                      {doc.file_size && ` · ${Math.round(doc.file_size / 1024)} KB`}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleDownload(doc)}>
                  Download
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
