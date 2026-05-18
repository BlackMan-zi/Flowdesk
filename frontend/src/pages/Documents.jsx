import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listDocuments, downloadDocument } from '../api/documents'
import { toast } from 'sonner'
import Card, { CardHeader } from '../components/ui/Card'
import Table from '../components/ui/Table'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { FileDown, Search, X, FileText, Users as UsersIcon } from 'lucide-react'

function fmt(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function tokenMatch(query, ...fields) {
  if (!query.trim()) return true
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  const hay = fields.filter(Boolean).join(' ').toLowerCase()
  return tokens.every(t => hay.includes(t))
}

export default function Documents() {
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')

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
      toast.error('Download failed.')
    }
  }

  const ccCount = useMemo(() => data.filter(d => d.share_reason === 'cc').length, [data])

  const tabFiltered = useMemo(() => {
    if (tab === 'cc') return data.filter(d => d.share_reason === 'cc')
    return data
  }, [data, tab])

  const searchFiltered = useMemo(() => {
    if (!search.trim()) return tabFiltered
    return tabFiltered.filter(d => tokenMatch(
      search,
      d.form_name, d.reference_number, d.initiator_name, d.initiator_email, d.file_name
    ))
  }, [tabFiltered, search])

  const downloadCol = {
    key: 'actions', label: '', render: r => (
      <Button size="sm" variant="secondary" onClick={() => handleDownload(r)}>
        <FileDown size={14} /> Download
      </Button>
    )
  }

  const allColumns = [
    { key: 'form_name',        label: 'Form',      render: r => (
      <span className="font-medium text-foreground">{r.form_name || '—'}</span>
    )},
    { key: 'reference_number', label: 'Reference', render: r => (
      <span className="font-mono text-xs text-muted-foreground">{r.reference_number}</span>
    )},
    { key: 'file_size',        label: 'Size',      render: r => r.file_size ? `${Math.round(r.file_size / 1024)} KB` : '—' },
    { key: 'generated_at',     label: 'Generated', render: r => fmt(r.generated_at) },
    downloadCol,
  ]

  const ccColumns = [
    { key: 'form_name',        label: 'Form',      render: r => (
      <span className="font-medium text-foreground">{r.form_name || '—'}</span>
    )},
    { key: 'reference_number', label: 'Reference', render: r => (
      <span className="font-mono text-xs text-muted-foreground">{r.reference_number}</span>
    )},
    { key: 'initiator', label: 'Initiator', render: r => (
      <div>
        <p className="text-sm text-foreground">{r.initiator_name || '—'}</p>
        {r.initiator_email && <p className="text-xs text-muted-foreground">{r.initiator_email}</p>}
      </div>
    )},
    { key: 'generated_at',     label: 'Generated', render: r => fmt(r.generated_at) },
    downloadCol,
  ]

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Documents</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Completed and approved forms available for download.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <TabsList className="h-auto gap-1 p-1">
            <TabsTrigger value="all" className="text-xs gap-1.5">
              <FileText size={13} />
              All Documents
              <span className="bg-muted text-muted-foreground data-[state=active]:bg-primary/15 data-[state=active]:text-primary rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-tight min-w-[16px] text-center">
                {data.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="cc" className="text-xs gap-1.5">
              <UsersIcon size={13} />
              CC'd to Me
              <span className="bg-muted text-muted-foreground data-[state=active]:bg-primary/15 data-[state=active]:text-primary rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-tight min-w-[16px] text-center">
                {ccCount}
              </span>
            </TabsTrigger>
          </TabsList>

          <div className="relative flex-1 sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search form, reference, initiator…"
              className="flex h-8 w-full rounded-md border border-input bg-background pl-8 pr-7 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        <TabsContent value="all" className="mt-4">
          <Card>
            <CardHeader
              title="All Documents"
              subtitle="Every completed form you have access to (initiator, approver, or CC'd)"
            />
            {isLoading
              ? <div className="flex justify-center py-12"><Spinner /></div>
              : (
                <>
                  {search && (
                    <p className="text-xs text-muted-foreground px-6 -mt-1 pb-2">
                      {searchFiltered.length} of {tabFiltered.length} match "{search}"
                    </p>
                  )}
                  <Table columns={allColumns} rows={searchFiltered} emptyMessage="No documents generated yet." />
                </>
              )
            }
          </Card>
        </TabsContent>

        <TabsContent value="cc" className="mt-4">
          <Card>
            <CardHeader
              title="CC'd to Me"
              subtitle="Completed forms where you're a CC recipient — copies of forms initiated by others"
            />
            {isLoading
              ? <div className="flex justify-center py-12"><Spinner /></div>
              : (
                <>
                  {search && (
                    <p className="text-xs text-muted-foreground px-6 -mt-1 pb-2">
                      {searchFiltered.length} of {tabFiltered.length} match "{search}"
                    </p>
                  )}
                  <Table columns={ccColumns} rows={searchFiltered} emptyMessage="No documents have been CC'd to you yet." />
                </>
              )
            }
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
