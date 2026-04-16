import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listFormInstances } from '../api/forms'
import {
  useReactTable, getCoreRowModel, getFilteredRowModel,
  getPaginationRowModel, getSortedRowModel, flexRender,
} from '@tanstack/react-table'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { SkeletonCard } from '../components/ui/Skeleton'
import { Alert, AlertTitle } from '../components/ui/alert'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/Table'
import {
  Plus, Search, X, Clock, CheckCircle2, XCircle,
  RotateCcw, FileEdit, ChevronRight, FileText,
  AlertTriangle, Calendar, Hash, ChevronLeft,
  ChevronsLeft, ChevronsRight, ArrowUpDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  Draft:                     { label: 'Draft',       icon: FileEdit,     color: 'text-slate-500' },
  Pending:                   { label: 'In Progress', icon: Clock,        color: 'text-amber-600' },
  'Returned for Correction': { label: 'Returned',    icon: RotateCcw,    color: 'text-orange-600' },
  Rejected:                  { label: 'Rejected',    icon: XCircle,      color: 'text-red-600' },
  Completed:                 { label: 'Completed',   icon: CheckCircle2, color: 'text-emerald-600' },
  Approved:                  { label: 'Approved',    icon: CheckCircle2, color: 'text-emerald-600' },
}

const STATUS_TABS = [
  { key: 'all',                       label: 'All' },
  { key: 'Draft',                     label: 'Draft' },
  { key: 'Pending',                   label: 'In Progress' },
  { key: 'Returned for Correction',   label: 'Returned' },
  { key: 'Rejected',                  label: 'Rejected' },
  { key: 'Completed',                 label: 'Completed' },
  { key: 'Approved',                  label: 'Approved' },
]

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

// ── Approval progress bar ─────────────────────────────────────────────────────

function ApprovalProgress({ progress }) {
  if (!progress) return null
  const { total_steps, completed_steps, active_step_order, active_step_label } = progress
  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-0.5 mb-1">
        {Array.from({ length: total_steps }).map((_, i) => {
          const stepNum = i + 1
          const isDone   = stepNum <= completed_steps
          const isActive = stepNum === active_step_order
          return (
            <div
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-all',
                isDone   ? 'bg-emerald-500' :
                isActive ? 'bg-amber-400' :
                           'bg-muted'
              )}
            />
          )
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Step {active_step_order}/{total_steps}{active_step_label ? ` · ${active_step_label}` : ''}
      </p>
    </div>
  )
}

// ── Summary stats row ─────────────────────────────────────────────────────────

function SummaryStats({ items, onTabChange }) {
  const counts = items.reduce((acc, i) => {
    acc[i.current_status] = (acc[i.current_status] || 0) + 1
    return acc
  }, {})

  const stats = [
    { label: 'Total',       value: items.length,                                              key: 'all',      color: 'text-foreground' },
    { label: 'In Progress', value: counts['Pending'] || 0,                                    key: 'Pending',  color: 'text-amber-600' },
    { label: 'Returned',    value: counts['Returned for Correction'] || 0,                    key: 'Returned for Correction', color: 'text-orange-600' },
    { label: 'Completed',   value: (counts['Completed'] || 0) + (counts['Approved'] || 0),   key: 'Completed', color: 'text-emerald-600' },
    { label: 'Rejected',    value: counts['Rejected'] || 0,                                   key: 'Rejected', color: 'text-red-600' },
    { label: 'Draft',       value: counts['Draft'] || 0,                                      key: 'Draft',    color: 'text-muted-foreground' },
  ]

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {stats.map(s => (
        <button
          key={s.label}
          onClick={() => onTabChange(s.key)}
          className="bg-card rounded-lg border border-border px-3 py-2.5 text-center hover:bg-muted/50 hover:border-primary/30 transition-all group"
        >
          <p className={cn('text-xl font-bold', s.color)}>{s.value}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">{s.label}</p>
        </button>
      ))}
    </div>
  )
}

// ── Request card (mobile) ────────────────────────────────────────────────────

function RequestCard({ item, onClick }) {
  const isReturned = item.current_status === 'Returned for Correction'
  const isDraft    = item.current_status === 'Draft'
  const isPending  = item.current_status === 'Pending'

  const accentColor = isReturned ? 'bg-orange-400' : isDraft ? 'bg-muted-foreground/30' :
    isPending ? 'bg-amber-400' :
    (item.current_status === 'Completed' || item.current_status === 'Approved') ? 'bg-emerald-400' :
    item.current_status === 'Rejected' ? 'bg-red-400' : 'bg-muted-foreground/30'

  return (
    <button
      onClick={onClick}
      className="w-full bg-card border border-border rounded-xl p-4 text-left hover:shadow-md hover:border-primary/30 transition-all group relative overflow-hidden"
    >
      <div className={cn('absolute left-0 top-0 bottom-0 w-0.5', accentColor)} />
      <div className="pl-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-foreground truncate">{item.form_name || 'Form'}</p>
              <Badge label={isPending ? 'In Progress' : item.current_status} />
            </div>
            <div className="flex items-center gap-1 mt-1">
              <Hash size={10} className="text-muted-foreground/40 flex-shrink-0" />
              <p className="text-xs text-muted-foreground font-mono">{item.reference_number}</p>
            </div>
            {isPending && item.approval_progress && <ApprovalProgress progress={item.approval_progress} />}
            {isReturned && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950 rounded-md px-2 py-1 border border-orange-200 dark:border-orange-800 w-fit">
                <AlertTriangle size={10} />
                <span className="font-semibold">Action required</span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {item.submitted_at && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar size={10} />
                <span>{fmt(item.submitted_at)}</span>
              </div>
            )}
            <ChevronRight size={14} className="text-muted-foreground/40 group-hover:text-primary transition-colors" />
          </div>
        </div>
      </div>
    </button>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ search, tab, onNew }) {
  if (search) return (
    <div className="text-center py-16">
      <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
        <Search size={22} className="text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold text-foreground">No results match your search</p>
      <p className="text-xs text-muted-foreground mt-1">Try different keywords or clear the search</p>
    </div>
  )
  if (tab && tab !== 'all') return (
    <div className="text-center py-16">
      <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
        <FileText size={22} className="text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold text-foreground">No {tab.toLowerCase()} requests</p>
      <p className="text-xs text-muted-foreground mt-1">Switch tabs to view other requests</p>
    </div>
  )
  return (
    <div className="text-center py-20">
      <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
        <FileText size={26} className="text-primary/60" />
      </div>
      <h3 className="text-base font-bold text-foreground">No requests yet</h3>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-xs mx-auto">
        Submit your first form to get started with the approval workflow
      </p>
      <Button className="mt-5" onClick={onNew}>
        <Plus size={14} /> Submit your first request
      </Button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MyForms() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [sorting, setSorting] = useState([{ id: 'submitted_at', desc: true }])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  const { data: allItems = [], isLoading } = useQuery({
    queryKey: ['form-instances'],
    queryFn: () => listFormInstances().then(r => r.data),
    refetchInterval: 30_000,
  })

  const returnedCount = allItems.filter(i => i.current_status === 'Returned for Correction').length

  const tabFiltered = useMemo(() => {
    if (activeTab === 'all') return allItems
    return allItems.filter(i => i.current_status === activeTab)
  }, [allItems, activeTab])

  const searchFiltered = useMemo(() => {
    if (!search.trim()) return tabFiltered
    const tokens = search.toLowerCase().split(/\s+/).filter(Boolean)
    return tabFiltered.filter(item => {
      const haystack = [
        item.form_name, item.reference_number, item.current_status,
        item.approval_progress?.active_step_label,
        item.approval_progress?.active_approver,
      ].filter(Boolean).join(' ').toLowerCase()
      return tokens.every(t => haystack.includes(t))
    })
  }, [tabFiltered, search])

  const tabCount = (key) => key === 'all' ? allItems.length : allItems.filter(i => i.current_status === key).length

  const columns = useMemo(() => [
    {
      accessorKey: 'form_name',
      header: ({ column }) => (
        <button className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider hover:text-foreground transition-colors" onClick={() => column.toggleSorting()}>
          Form <ArrowUpDown size={12} />
        </button>
      ),
      cell: ({ row }) => {
        const item = row.original
        const isPending = item.current_status === 'Pending'
        return (
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate max-w-[200px]">{item.form_name}</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{item.reference_number}</p>
            {isPending && item.approval_progress && <ApprovalProgress progress={item.approval_progress} />}
          </div>
        )
      },
    },
    {
      accessorKey: 'current_status',
      header: 'Status',
      cell: ({ getValue }) => {
        const status = getValue()
        return <Badge label={status === 'Pending' ? 'In Progress' : status} />
      },
    },
    {
      accessorKey: 'submitted_at',
      header: ({ column }) => (
        <button className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider hover:text-foreground transition-colors" onClick={() => column.toggleSorting()}>
          Submitted <ArrowUpDown size={12} />
        </button>
      ),
      cell: ({ getValue }) => (
        <span className="text-xs text-muted-foreground">{fmt(getValue())}</span>
      ),
    },
    {
      id: 'action',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => navigate(`/my-forms/${row.original.id}`)}
        >
          View <ChevronRight size={13} />
        </Button>
      ),
    },
  ], [navigate])

  const table = useReactTable({
    data: searchFiltered,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const handleTabChange = (key) => {
    setActiveTab(key)
    setPagination(p => ({ ...p, pageIndex: 0 }))
  }

  return (
    <div className="max-w-5xl space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">My Requests</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track all your requisitions and approval progress</p>
        </div>
        <Button onClick={() => navigate('/my-forms/new')} className="flex-shrink-0">
          <Plus size={14} /> New Request
        </Button>
      </div>

      {/* Attention alert */}
      {returnedCount > 0 && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="flex items-center justify-between">
            <span>{returnedCount} request{returnedCount > 1 ? 's' : ''} returned for your correction</span>
            <Button size="xs" variant="outline" className="ml-2" onClick={() => handleTabChange('Returned for Correction')}>
              View
            </Button>
          </AlertTitle>
        </Alert>
      )}

      {/* Summary stats */}
      {!isLoading && allItems.length > 0 && (
        <SummaryStats items={allItems} onTabChange={handleTabChange} />
      )}

      {/* Tabs + search */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <TabsList className="flex-wrap h-auto gap-1 p-1">
            {STATUS_TABS.map(tab => {
              const count = tabCount(tab.key)
              return (
                <TabsTrigger key={tab.key} value={tab.key} className="text-xs gap-1.5">
                  {tab.label}
                  {count > 0 && (
                    <span className="bg-muted text-muted-foreground data-[state=active]:bg-primary/15 data-[state=active]:text-primary rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-tight min-w-[16px] text-center">
                      {count}
                    </span>
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>

          {/* Search */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPagination(p => ({ ...p, pageIndex: 0 })) }}
              placeholder="Search forms, refs, approvers…"
              className="flex h-8 w-full rounded-md border border-input bg-background pl-8 pr-7 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {STATUS_TABS.map(tab => (
          <TabsContent key={tab.key} value={tab.key} className="mt-4">
            {isLoading ? (
              <SkeletonCard rows={5} title={false} />
            ) : searchFiltered.length === 0 ? (
              <EmptyState search={search} tab={activeTab} onNew={() => navigate('/my-forms/new')} />
            ) : (
              <>
                {/* Results count */}
                <p className="text-xs text-muted-foreground mb-3">
                  {searchFiltered.length} result{searchFiltered.length !== 1 ? 's' : ''}
                  {search && ` for "${search}"`}
                </p>

                {/* Desktop table */}
                <div className="hidden sm:block">
                  <Card>
                    <Table>
                      <TableHeader>
                        {table.getHeaderGroups().map(hg => (
                          <TableRow key={hg.id} className="hover:bg-transparent">
                            {hg.headers.map(h => (
                              <TableHead key={h.id} className="text-xs text-muted-foreground">
                                {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                              </TableHead>
                            ))}
                          </TableRow>
                        ))}
                      </TableHeader>
                      <TableBody>
                        {table.getRowModel().rows.map(row => (
                          <TableRow
                            key={row.id}
                            className="cursor-pointer"
                            onClick={() => navigate(`/my-forms/${row.original.id}`)}
                          >
                            {row.getVisibleCells().map(cell => (
                              <TableCell key={cell.id}>
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                </div>

                {/* Mobile cards */}
                <div className="sm:hidden space-y-2.5">
                  {table.getRowModel().rows.map(row => (
                    <RequestCard
                      key={row.id}
                      item={row.original}
                      onClick={() => navigate(`/my-forms/${row.original.id}`)}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {table.getPageCount() > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()} ·{' '}
                      {searchFiltered.length} results
                    </p>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
                        <ChevronsLeft size={13} />
                      </Button>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                        <ChevronLeft size={13} />
                      </Button>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                        <ChevronRight size={13} />
                      </Button>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
                        <ChevronsRight size={13} />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
