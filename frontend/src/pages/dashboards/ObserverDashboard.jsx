import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listDocuments, downloadDocument } from '../../api/documents'
import { listFormInstances } from '../../api/forms'
import { useAuth } from '../../context/AuthContext'
import Card, { CardHeader } from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'
import { FileDown, Search } from 'lucide-react'

export default function ObserverDashboard() {
  const { user } = useAuth()
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
      alert('Download failed.')
    }
  }

  return (
    <div className="max-w-3xl space-y-5">

      <div>
        <h1 className="text-xl font-bold text-slate-900">Document Library</h1>
        <p className="text-sm text-slate-500 mt-0.5">Completed and approved forms available to you.</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name or reference…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
      </div>

      <Card>
        <CardHeader
          title="Available Documents"
          subtitle={`${filtered.length} document${filtered.length !== 1 ? 's' : ''}`}
        />
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <FileDown size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">
              {search ? 'No documents match your search.' : 'No completed documents available yet.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(doc => (
              <div key={doc.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileDown size={16} className="text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{doc.file_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {doc.reference_number} · {fmt(doc.generated_at)}
                      {doc.file_size && ` · ${Math.round(doc.file_size / 1024)} KB`}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => handleDownload(doc)}>
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

function fmt(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
