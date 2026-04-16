import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { listFormDefinitions, getFormDefinition, createFormInstance, saveDraft, submitFormInstance } from '../api/forms'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { useAuth } from '../context/AuthContext'
import PDFFormFill from '../components/pdf/PDFFormFill'
import { ChevronLeft, ChevronRight, FileText, Check, Save, Send, AlertCircle } from 'lucide-react'
import { evaluateFormula } from '../utils/formulaEngine'
import { cn } from '@/lib/utils'

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

// ── Field renderer ────────────────────────────────────────────────────────────

function FieldRenderer({ field, value, onChange, user }) {
  if (field.auto_filled) {
    return (
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">{field.field_label}</label>
        <input
          readOnly
          value={value || ''}
          className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
        />
      </div>
    )
  }

  const common = {
    label: field.field_label,
    required: field.required,
    placeholder: field.placeholder || '',
    value: value || '',
  }

  switch (field.field_type) {
    case 'textarea':
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            {field.field_label}{field.required && <span className="text-destructive ml-0.5">*</span>}
          </label>
          <textarea
            rows={3}
            placeholder={field.placeholder || ''}
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            required={field.required}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
        </div>
      )
    case 'number':
    case 'currency':
      return <Input {...common} type="number" step={field.field_type === 'currency' ? '0.01' : '1'} onChange={e => onChange(e.target.value)} />
    case 'date':
      return <Input {...common} type="date" onChange={e => onChange(e.target.value)} />
    case 'dropdown':
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            {field.field_label}{field.required && <span className="text-destructive ml-0.5">*</span>}
          </label>
          <select
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            required={field.required}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Select…</option>
            {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )
    case 'checkbox':
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            {field.field_label}{field.required && <span className="text-destructive ml-0.5">*</span>}
          </label>
          <div className="space-y-2">
            {(field.options || []).map(o => (
              <label key={o} className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={(value || '').split(',').filter(Boolean).includes(o)}
                  onChange={e => {
                    const cur = (value || '').split(',').filter(Boolean)
                    if (e.target.checked) cur.push(o)
                    else cur.splice(cur.indexOf(o), 1)
                    onChange(cur.join(','))
                  }}
                  className="rounded border-input text-primary focus:ring-ring w-4 h-4"
                />
                <span>{o}</span>
              </label>
            ))}
          </div>
        </div>
      )
    case 'radio':
      return (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            {field.field_label}{field.required && <span className="text-destructive ml-0.5">*</span>}
          </label>
          <div className="space-y-2">
            {(field.options || []).map(o => (
              <label key={o} className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
                <input
                  type="radio"
                  name={field.id}
                  value={o}
                  checked={value === o}
                  onChange={() => onChange(o)}
                  className="border-input text-primary focus:ring-ring w-4 h-4"
                />
                <span>{o}</span>
              </label>
            ))}
          </div>
        </div>
      )
    default:
      return <Input {...common} type="text" onChange={e => onChange(e.target.value)} />
  }
}

// ── Action bar ────────────────────────────────────────────────────────────────

function ActionBar({ draftSaved, onSubmit, onDraft, onCancel, submitLoading, draftLoading }) {
  return (
    <div className="flex items-center gap-3 flex-wrap pt-2">
      <Button onClick={onSubmit} loading={submitLoading}>
        <Send size={14} /> Submit for Approval
      </Button>
      <Button variant="outline" onClick={onDraft} loading={draftLoading}>
        <Save size={14} />
        {draftSaved ? 'Saved!' : 'Save Draft'}
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SubmitForm() {
  const navigate  = useNavigate()
  const qc        = useQueryClient()
  const { user }  = useAuth()

  const [selectedDefId, setSelectedDefId] = useState('')
  const [fieldValues, setFieldValues]     = useState({})
  const [step, setStep]                   = useState('select')
  const [error, setError]                 = useState('')
  const [draftId, setDraftId]             = useState(null)
  const [draftSaved, setDraftSaved]       = useState(false)

  const { data: defs = [], isLoading: defsLoading } = useQuery({
    queryKey: ['form-definitions'],
    queryFn: () => listFormDefinitions().then(r => r.data)
  })

  // staleTime: 0 ensures we always get the latest field configuration after Design Layout edits
  const { data: formDef, isLoading: defLoading } = useQuery({
    queryKey: ['form-definition', selectedDefId],
    queryFn: () => getFormDefinition(selectedDefId).then(r => r.data),
    enabled: !!selectedDefId,
    staleTime: 0,
  })

  const fieldsByName = useMemo(() => {
    const map = {}
    ;(formDef?.fields || []).forEach(f => { map[f.field_name] = f })
    return map
  }, [formDef?.fields])

  const buildFieldValues = () => {
    if (!formDef?.fields) return []
    // fieldValues already has auto-filled values injected by PDFFormFill on mount,
    // so we just use them directly. Calculated fields are re-evaluated here for submission.
    return formDef.fields
      .filter(f => f.is_active !== false)
      .map(f => {
        let value = fieldValues[f.id]
        if (f.field_type === 'calculated') value = evaluateFormula(f.calculation_formula, fieldValues, fieldsByName)
        return { form_field_id: f.id, value: value != null ? String(value) : '' }
      })
  }

  const setField = (id, val) => setFieldValues(p => ({ ...p, [id]: val }))

  const draftMutation = useMutation({
    mutationFn: async () => {
      const values = buildFieldValues()
      if (draftId) {
        await saveDraft(draftId, { field_values: values })
        return draftId
      } else {
        const inst = await createFormInstance({ form_definition_id: selectedDefId, field_values: values })
        setDraftId(inst.data.id)
        return inst.data.id
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['form-instances'] })
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 2500)
      toast.success('Draft saved')
    },
    onError: (err) => {
      const msg = err.response?.data?.detail || 'Draft save failed.'
      setError(msg)
      toast.error(msg)
    }
  })

  const submitMutation = useMutation({
    mutationFn: async () => {
      const values = buildFieldValues()
      let instanceId = draftId
      if (!instanceId) {
        const inst = await createFormInstance({ form_definition_id: selectedDefId, field_values: values })
        instanceId = inst.data.id
        setDraftId(instanceId)
      }
      await submitFormInstance(instanceId, { field_values: values, change_notes: 'Initial submission' })
      return instanceId
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['form-instances'] })
      toast.success('Form submitted for approval!')
      navigate(`/my-forms/${id}`)
    },
    onError: (err) => {
      const msg = err.response?.data?.detail || 'Submission failed.'
      setError(msg)
      toast.error(msg)
    }
  })

  if (defsLoading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Loading forms…</p>
    </div>
  )

  return (
    <div className="max-w-2xl space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => step === 'fill' ? setStep('select') : navigate(-1)}
          className="w-9 h-9 rounded-xl hover:bg-accent text-muted-foreground flex items-center justify-center transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">New Request</h1>
          <div className="mt-0.5">
            <StepBar step={step} formName={formDef?.name} />
          </div>
        </div>
      </div>

      {/* Step 1: Select form type */}
      {step === 'select' && (
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
                onClick={() => { setSelectedDefId(def.id); setStep('fill') }}
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
      )}

      {/* Step 2: Fill form */}
      {step === 'fill' && (
        <>
          {defLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Loading form…</p>
            </div>
          ) : formDef?.pdf_template_path ? (
            <>
              <PDFFormFill
                formDef={formDef}
                values={fieldValues}
                onChange={(id, val) => setField(id, val)}
                currentUser={user}
              />
              {error && (
                <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 text-sm text-destructive">
                  <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
              <ActionBar
                draftSaved={draftSaved}
                onSubmit={() => submitMutation.mutate()}
                onDraft={() => draftMutation.mutate()}
                onCancel={() => navigate(-1)}
                submitLoading={submitMutation.isPending}
                draftLoading={draftMutation.isPending}
              />
            </>
          ) : formDef ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{formDef.name}</CardTitle>
                {formDef.description && <CardDescription>{formDef.description}</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-4">
                {formDef.fields?.filter(f => f.is_active !== false).map(field => (
                  <FieldRenderer
                    key={field.id}
                    field={field}
                    value={
                      field.field_type === 'calculated'
                        ? String(evaluateFormula(field.calculation_formula, fieldValues, fieldsByName) ?? '')
                        : fieldValues[field.id] || ''
                    }
                    onChange={val => setField(field.id, val)}
                    user={user}
                  />
                ))}

                {error && (
                  <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 text-sm text-destructive">
                    <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                    {error}
                  </div>
                )}

                <ActionBar
                  draftSaved={draftSaved}
                  onSubmit={() => submitMutation.mutate()}
                  onDraft={() => draftMutation.mutate()}
                  onCancel={() => setStep('select')}
                  submitLoading={submitMutation.isPending}
                  draftLoading={draftMutation.isPending}
                />
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  )
}
