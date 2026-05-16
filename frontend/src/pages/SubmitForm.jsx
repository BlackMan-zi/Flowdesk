import React, { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  listFormDefinitions, getFormDefinition,
  createFormInstance, saveDraft, submitFormInstance, uploadAttachment,
} from '../api/forms'
import { getMyOrganization, fetchHeaderImageObjectUrl, fetchFooterImageObjectUrl } from '../api/settings'
import { listUsers } from '../api/users'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card'
import Button from '../components/ui/Button'
import { useAuth } from '../context/AuthContext'
import { ChevronLeft, ChevronRight, FileText, Check, Save, Send, AlertCircle } from 'lucide-react'
import { resolveCalculatedFields } from '../utils/formulaEngine'
import { cn } from '@/lib/utils'
import FormFillerCanvas from '../components/forms/FormFillerCanvas'
import SignaturePad from '../components/forms/SignaturePad'
import { resolveClassification } from '../lib/classification'

// ── Step breadcrumb ───────────────────────────────────────────────────────────

function StepBar({ step, formName }) {
  const steps = [
    { key: 'select', label: 'Select Form' },
    { key: 'fill',   label: formName || 'Fill Details' },
  ]
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => {
        const isActive = s.key === step
        const isDone   = steps.findIndex(x => x.key === step) > i
        return (
          <React.Fragment key={s.key}>
            {i > 0 && <ChevronRight size={14} className="text-muted-foreground/40 flex-shrink-0" />}
            <span className={cn(
              'text-sm font-medium flex items-center gap-1.5',
              isActive ? 'text-foreground' : isDone ? 'text-primary' : 'text-muted-foreground'
            )}>
              {isDone && <Check size={13} className="text-primary" />}
              {s.label}
            </span>
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── System-block auto-fill sources (rendered visually, value persisted empty) ──
const SYSTEM_BLOCK_SOURCES = new Set([
  'reference_number', 'submission_date', 'form_classification', 'approval_block', 'static_text',
])

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SubmitForm() {
  const navigate  = useNavigate()
  const qc        = useQueryClient()
  const { user }  = useAuth()

  const [selectedDefId, setSelectedDefId] = useState('')
  const [fieldValues, setFieldValues]     = useState({})
  const [pendingFiles, setPendingFiles]   = useState({})
  const [step, setStep]                   = useState('select')
  const [error, setError]                 = useState('')
  const [draftId, setDraftId]             = useState(null)
  const [draftSaved, setDraftSaved]       = useState(false)
  const [letterheadUrls, setLetterheadUrls] = useState({ header: null, footer: null })
  // Initiator's signature + chosen submission date. Required at submit, not
  // for Save Draft. Date defaults to today and is editable for backdating.
  const [initiatorSignature, setInitiatorSignature] = useState('')
  const [initiatorSignedAt, setInitiatorSignedAt] = useState(
    () => new Date().toISOString().slice(0, 10)
  )

  // ── Lookups ──
  const { data: defs = [], isLoading: defsLoading } = useQuery({
    queryKey: ['form-definitions'],
    queryFn: () => listFormDefinitions().then(r => r.data),
  })
  const { data: formDef, isLoading: defLoading } = useQuery({
    queryKey: ['form-definition', selectedDefId],
    queryFn: () => getFormDefinition(selectedDefId).then(r => r.data),
    enabled: !!selectedDefId,
    staleTime: 0,
  })
  const { data: org } = useQuery({
    queryKey: ['my-organization'],
    queryFn: () => getMyOrganization().then(r => r.data),
  })
  const { data: usersList = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => listUsers().then(r => r.data),
  })

  // Header/footer object URLs from the org
  useEffect(() => {
    if (!org) return
    let cancelled = false
    const urls = { header: null, footer: null }
    const ps = []
    if (org.has_header_image) ps.push(fetchHeaderImageObjectUrl().then(u => { urls.header = u }).catch(() => {}))
    if (org.has_footer_image) ps.push(fetchFooterImageObjectUrl().then(u => { urls.footer = u }).catch(() => {}))
    Promise.all(ps).then(() => { if (!cancelled) setLetterheadUrls(urls) })
    return () => {
      cancelled = true
      if (urls.header) URL.revokeObjectURL(urls.header)
      if (urls.footer) URL.revokeObjectURL(urls.footer)
    }
  }, [org?.id, org?.has_header_image, org?.has_footer_image])

  // ── Auto-fill source resolution ──
  useEffect(() => {
    if (!formDef?.fields || !user) return
    const today = new Date().toISOString().slice(0, 10)  // YYYY-MM-DD for <input type=date>
    const sourceValues = {
      'current_user.name':                user.name,
      'current_user.email':               user.email,
      'current_user.department':          user.department_name,
      'current_user.department.name':     user.department_name,
      'current_user.unit':                user.unit_name,
      'current_user.unit.name':           user.unit_name,
      'current_user.top_department.name': user.department_name,
      'current_user.date':                today,
      'submission_date':                  today,
      'form.submitted_at':                today,
      'approver.initiator.name':          user.name,
      'approver.initiator.date':          today,
      'approver.line_manager.name':       user.manager_name,
      'approver.sn_manager.name':         user.sn_manager_name,
      'approver.hod.name':                user.hod_name,
      'form_classification':              formDef.confidentiality || '',
      'reference_number':                 '',         // filled by backend at submit
      'approval_block':                   '',         // display-only
    }
    formDef.fields.filter(f => f.auto_filled && f.auto_fill_source).forEach(f => {
      const val = f.auto_fill_source === 'static_text'
        ? (f.default_value || '')
        : sourceValues[f.auto_fill_source]
      if (val != null) setFieldValues(p => ({ ...p, [f.id]: val }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formDef?.id, user?.id, formDef?.confidentiality])

  // ── Calculated fields — live re-eval via legacy engine (field_name tokens) ──
  const fieldsByName = useMemo(() => {
    const map = {}
    ;(formDef?.fields || []).forEach(f => { map[f.field_name] = f })
    return map
  }, [formDef?.fields])

  const resolvedValues = useMemo(() => {
    if (!formDef?.fields) return fieldValues
    return resolveCalculatedFields(formDef.fields, fieldValues, fieldsByName)
  }, [formDef?.fields, fieldValues, fieldsByName])

  // ── Mutations ──
  const setFieldValue = (id, val) => setFieldValues(p => ({ ...p, [id]: val }))
  const setFilesFor   = (id, files) => setPendingFiles(p => ({ ...p, [id]: files }))

  const buildFieldValuesPayload = () => {
    if (!formDef?.fields) return []
    return formDef.fields
      .filter(f => f.is_active !== false)
      .map(f => {
        // System blocks store '' — actual values rendered from instance/org/user at view time.
        if (f.auto_fill_source && SYSTEM_BLOCK_SOURCES.has(f.auto_fill_source) && f.auto_fill_source !== 'static_text') {
          return { form_field_id: f.id, value: '' }
        }
        const v = resolvedValues[f.id]
        return { form_field_id: f.id, value: v != null ? String(v) : '' }
      })
  }

  const uploadAllPendingFiles = async (instanceId) => {
    const allFiles = Object.values(pendingFiles).flat().filter(Boolean)
    if (!allFiles.length) return
    const results = await Promise.allSettled(allFiles.map(f => uploadAttachment(instanceId, f)))
    const failed = results.filter(r => r.status === 'rejected').length
    if (failed > 0) toast.error(`${failed} attachment${failed === 1 ? '' : 's'} failed to upload — retry from the form detail page.`)
    setPendingFiles({})
  }

  const draftMutation = useMutation({
    mutationFn: async () => {
      const values = buildFieldValuesPayload()
      let instanceId = draftId
      if (instanceId) {
        await saveDraft(instanceId, { field_values: values })
      } else {
        const inst = await createFormInstance({ form_definition_id: selectedDefId, field_values: values })
        instanceId = inst.data.id
        setDraftId(instanceId)
      }
      await uploadAllPendingFiles(instanceId)
      return instanceId
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['form-instances'] })
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 1500)
      toast.success('Draft saved')
    },
    onError: (err) => {
      const msg = err.response?.data?.detail || 'Draft save failed.'
      setError(msg); toast.error(msg)
    },
  })

  const submitMutation = useMutation({
    mutationFn: async () => {
      const values = buildFieldValuesPayload()
      let instanceId = draftId
      if (!instanceId) {
        const inst = await createFormInstance({ form_definition_id: selectedDefId, field_values: values })
        instanceId = inst.data.id
        setDraftId(instanceId)
      }
      await uploadAllPendingFiles(instanceId)
      // Convert the date input (YYYY-MM-DD, local) to a midday ISO timestamp
      // so the backend stores a stable date regardless of the server timezone.
      const signedAtIso = initiatorSignedAt
        ? new Date(`${initiatorSignedAt}T12:00:00`).toISOString()
        : null
      await submitFormInstance(instanceId, {
        field_values: values,
        change_notes: 'Initial submission',
        initiator_signature_data: initiatorSignature,
        initiator_signed_at: signedAtIso,
      })
      return instanceId
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['form-instances'] })
      toast.success('Form submitted for approval!')
      navigate(`/my-forms/${id}`)
    },
    onError: (err) => {
      const msg = err.response?.data?.detail || 'Submission failed.'
      setError(msg); toast.error(msg)
    },
  })

  // ── Resolved props for the canvas ──
  // Falls back to the standard label palette when the org hasn't customised
  // its own labels — otherwise forms tagged with a default classification
  // would render as "Unclassified".
  const classification = useMemo(
    () => resolveClassification(formDef?.confidentiality, org?.classification_labels),
    [formDef?.confidentiality, org?.classification_labels]
  )

  const approvalSteps = formDef?.approval_template?.steps || []

  if (defsLoading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Loading forms…</p>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header (always visible) */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => step === 'fill' ? setStep('select') : navigate(-1)}
          className="w-9 h-9 rounded-xl hover:bg-accent text-muted-foreground flex items-center justify-center transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">New Request</h1>
          <div className="mt-0.5"><StepBar step={step} formName={formDef?.name} /></div>
        </div>
      </div>

      {/* Step 1: Select form type */}
      {step === 'select' && (
        <div className="max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Select Form Type</CardTitle>
              <CardDescription>Choose the type of request you want to submit</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {defs.length === 0 ? (
                <div className="text-center py-10">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                    <FileText size={20} className="text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No form types available</p>
                  <p className="text-xs text-muted-foreground mt-1">Ask your administrator to set up form definitions.</p>
                </div>
              ) : defs.map(def => (
                <button
                  key={def.id}
                  onClick={() => {
                    setSelectedDefId(def.id)
                    setFieldValues({})
                    setPendingFiles({})
                    setDraftId(null)
                    setStep('fill')
                  }}
                  className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 text-left transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-muted group-hover:bg-primary/10 flex items-center justify-center flex-shrink-0 transition-colors">
                      <FileText size={15} className="text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{def.name}</p>
                      {def.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{def.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded-md">{def.code_suffix}</span>
                    <ChevronRight size={14} className="text-muted-foreground/40 group-hover:text-primary transition-colors" />
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 2: Fill form (WYSIWYG canvas) */}
      {step === 'fill' && (
        <>
          {defLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Loading form…</p>
            </div>
          ) : formDef ? (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-lg p-4">
                <FormFillerCanvas
                  formDef={formDef}
                  headerUrl={letterheadUrls.header}
                  footerUrl={letterheadUrls.footer}
                  accent={org?.letterhead_accent}
                  classification={classification}
                  user={user}
                  users={usersList}
                  roles={[]}
                  approvalSteps={approvalSteps}
                  referenceNumber={null}
                  fieldValues={resolvedValues}
                  onFieldChange={setFieldValue}
                  pendingFiles={pendingFiles}
                  onFilesChange={setFilesFor}
                />
              </div>

              {/* Certify & Submit — initiator's signature + chosen date are
                  mandatory to submit. Defaults to today; user can backdate
                  for events that happened earlier. Not required for Save
                  Draft. */}
              <div className="max-w-2xl mx-auto bg-card border border-border rounded-lg p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Certify & Submit</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sign below and confirm the submission date to send this form into the approval chain.
                  </p>
                </div>
                <SignaturePad
                  value={initiatorSignature}
                  onChange={setInitiatorSignature}
                  label="Your signature"
                  required
                />
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Submission date <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="date"
                    value={initiatorSignedAt}
                    onChange={e => setInitiatorSignedAt(e.target.value)}
                    className="border border-input bg-background rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Defaults to today. Adjust if this form represents an event from another date.
                  </p>
                </div>
              </div>

              {error && (
                <div className="max-w-2xl mx-auto flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 text-sm text-destructive">
                  <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <div className="max-w-2xl mx-auto flex items-center gap-3 flex-wrap pt-2">
                <Button
                  onClick={() => submitMutation.mutate()}
                  loading={submitMutation.isPending}
                  disabled={!initiatorSignature || !initiatorSignedAt}
                  title={!initiatorSignature || !initiatorSignedAt ? 'Sign and pick a date to enable submit' : undefined}
                >
                  <Send size={14} /> Submit for Approval
                </Button>
                <Button variant="outline" onClick={() => draftMutation.mutate()} loading={draftMutation.isPending}>
                  <Save size={14} />
                  {draftSaved ? 'Saved!' : 'Save Draft'}
                </Button>
                <Button variant="ghost" onClick={() => setStep('select')}>Cancel</Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
