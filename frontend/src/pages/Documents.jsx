import React, { useMemo, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listDocuments, downloadDocument } from '../api/documents'
import { toast } from 'sonner'
import Card, { CardHeader } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import {
  FileDown, Search, X, FileText, Users as UsersIcon,
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight,
  Database,
} from 'lucide-react'
import { cn } from '../lib/utils'

const PAGE_SIZES = [10, 25, 50]

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

// ── Date bucket assignment ───────────────────────────────────────────────────
//
// All comparisons in the user's local timezone. Returns a stable string
// label that we group rows by. Order is enforced by the data being
// pre-sorted by `generated_at` desc, so the first bucket we encounter on the
// page is the most recent.

function startOfLocalDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function bucketFor(iso, now = new Date()) {
  if (!iso) return 'Older'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'Older'
  const today = startOfLocalDay(now)
  const dayStart = startOfLocalDay(d)
  const diffDays = Math.round((today - dayStart) / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return 'This Week'
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
    return 'This Month'
  }
  return 'Older'
}

// ── Pager footer (page indicator + page-size toggle + nav) ───────────────────

function PagerFooter({ pageIndex, pageSize, totalRows, onChangePage, onChangePageSize }) {
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize))
  const canPrev = pageIndex > 0
  const canNext = pageIndex < pageCount - 1
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-border px-6 pb-4">
      <p className="text-xs text-muted-foreground">
        Page {pageIndex + 1} of {pageCount} · {totalRows} {totalRows === 1 ? 'result' : 'results'}
      </p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground mr-1">Per page</span>
          {PAGE_SIZES.map(n => (
            <button
              key={n}
              type="button"
              onClick={() => onChangePageSize(n)}
              className={cn(
                'h-7 min-w-[28px] px-2 rounded border text-xs font-medium transition-colors',
                pageSize === n
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-border hover:bg-muted'
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7"
                  onClick={() => onChangePage(0)} disabled={!canPrev}>
            <ChevronsLeft size={13} />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7"
                  onClick={() => onChangePage(pageIndex - 1)} disabled={!canPrev}>
            <ChevronLeft size={13} />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7"
                  onClick={() => onChangePage(pageIndex + 1)} disabled={!canNext}>
            <ChevronRight size={13} />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7"
                  onClick={() => onChangePage(pageCount - 1)} disabled={!canNext}>
            <ChevronsRight size={13} />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Grouped table: section headers inserted at bucket boundaries ────────────

function GroupedDocsTable({ rows, columns, onDownload }) {
  if (!rows.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
          <Database size={20} className="text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground font-medium">No documents to show.</p>
      </div>
    )
  }
  // Build a render-list that splices section header rows between data rows
  // wherever the bucket changes from the row above. Pre-sorted desc by
  // generated_at, so the first bucket on the page is the most recent.
  const out = []
  let lastBucket = null
  rows.forEach(r => {
    const b = bucketFor(r.generated_at)
    if (b !== lastBucket) {
      out.push({ kind: 'header', label: b, key: `h-${b}-${r.id}` })
      lastBucket = b
    }
    out.push({ kind: 'row', data: r, key: r.id })
  })
  const colCount = columns.length

  return (
    <div className="overflow-x-auto border border-border rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {columns.map(c => (
              <th key={c.key} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {out.map(item => {
            if (item.kind === 'header') {
              return (
                <tr key={item.key} className="bg-muted/30">
                  <td colSpan={colCount} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {item.label}
                  </td>
                </tr>
              )
            }
            const r = item.data
            return (
              <tr key={item.key} className="hover:bg-muted/30 transition-colors">
                {columns.map(c => (
                  <td key={c.key} className="px-4 py-3 text-foreground">
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Documents() {
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(10)

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
    const base = !search.trim()
      ? tabFiltered
      : tabFiltered.filter(d => tokenMatch(
          search,
          d.form_name, d.reference_number, d.initiator_name, d.initiator_email, d.file_name
        ))
    // Most recent on top. Falls back to created_at-equivalent if missing.
    return [...base].sort((a, b) => {
      const ta = new Date(a.generated_at || 0).getTime()
      const tb = new Date(b.generated_at || 0).getTime()
      return tb - ta
    })
  }, [tabFiltered, search])

  // Reset to page 0 when the visible set changes shape (search, tab, page-size).
  useEffect(() => {
    setPageIndex(0)
  }, [tab, search, pageSize])

  const pagedRows = useMemo(() => {
    const start = pageIndex * pageSize
    return searchFiltered.slice(start, start + pageSize)
  }, [searchFiltered, pageIndex, pageSize])

  const downloadCol = {
    key: 'actions', label: '', render: r => (
      <Button size="sm" variant="secondary" onClick={() => handleDownload(r)}>
        <FileDown size={14} /> Download
      </Button>
    )
  }

  const allColumns = [
    { key: 'form_name', label: 'Form', render: r => (
      <span className="font-medium text-foreground">{r.form_name || '—'}</span>
    )},
    { key: 'reference_number', label: 'Reference', render: r => (
      <span className="font-mono text-xs text-muted-foreground">{r.reference_number}</span>
    )},
    { key: 'file_size', label: 'Size', render: r => r.file_size ? `${Math.round(r.file_size / 1024)} KB` : '—' },
    { key: 'generated_at', label: 'Generated', render: r => fmt(r.generated_at) },
    downloadCol,
  ]

  const ccColumns = [
    { key: 'form_name', label: 'Form', render: r => (
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
    { key: 'generated_at', label: 'Generated', render: r => fmt(r.generated_at) },
    downloadCol,
  ]

  const columns = tab === 'cc' ? ccColumns : allColumns

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
                  <div className="px-6">
                    <GroupedDocsTable rows={pagedRows} columns={columns} />
                  </div>
                  <PagerFooter
                    pageIndex={pageIndex}
                    pageSize={pageSize}
                    totalRows={searchFiltered.length}
                    onChangePage={setPageIndex}
                    onChangePageSize={setPageSize}
                  />
                </>
              )
            }
          </Card>
        </TabsContent>

        <TabsContent value="cc" className="mt-4">
          <Card>
            <CardHeader
              title="CC'd to Me"
              subtitle="Completed forms where you're a CC recipient: copies of forms initiated by others"
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
                  <div className="px-6">
                    <GroupedDocsTable rows={pagedRows} columns={columns} />
                  </div>
                  <PagerFooter
                    pageIndex={pageIndex}
                    pageSize={pageSize}
                    totalRows={searchFiltered.length}
                    onChangePage={setPageIndex}
                    onChangePageSize={setPageSize}
                  />
                </>
              )
            }
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
