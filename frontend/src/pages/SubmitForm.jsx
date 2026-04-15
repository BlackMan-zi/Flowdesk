import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { listFormDefinitions, getFormDefinition, createFormInstance, saveDraft, submitFormInstance } from '../api/forms'
import Card, { CardHeader } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input, { Select, Textarea } from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'
import { useAuth } from '../context/AuthContext'
import PDFFormFill from '../components/pdf/PDFFormFill'
import { ChevronLeft, ChevronRight, FileText, Check, Save, Send } from 'lucide-react'
import { evaluateFormula } from '../utils/formulaEngine'

// ── Step breadcrumb indicator ─────────────────────────────────────────────────

function StepBar({ step, formName }) {
  const steps = [
    { key: 'select', label: 'Select Form' },
    { key: 'fill',   label: formName || 'Fill Details' },
  ]
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => {
        const isActive   = s.key === step
        const isDone     = steps.findIndex(x => x.key === step) > i
        return (
          <React.Fragment key={s.key}>
            {i > 0 && <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />}
            <span className={`text-sm font-semibold flex items-center gap-1.5 ${
              isActive ? 'text-slate-900' : isDone ? 'text-brand-600' : 'text-slate-400'
            }`}>
              {isDone && <Check size={13} className="text-brand-600" />}
              {s.label}
            </span>
          </React.Fragment>
        )
      })}
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

  const { data: formDef, isLoading: defLoading } = useQuery({
    queryKey: ['form-definition', selectedDefId],
    queryFn: () => getFormDefinition(selectedDefId).then(r => r.data),
    enabled: !!selectedDefId
  })

  const fieldsByName = useMemo(() => {
    const map = {}
    ;(formDef?.fields || []).forEach(f => { map[f.field_name] = f })
    return map
  }, [formDef?.fields])

  const buildFieldValues = () => {
    if (!formDef?.fields) return []
    return formDef.fields
      .filter(f => f.is_active !== false)
      .map(f => {
        let value = fieldValues[f.id]
        if (f.auto_filled && f.auto_fill_source === 'current_user.name') value = user?.name || ''
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
      qc.invalidateQueries(['form-instances'])
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
      qc.invalidateQueries(['form-instances'])
      toast.success('Form submitted for approval!')
      navigate(`/my-forms/${id}`)
    },
    onError: (err) => {
      const msg = err.response?.data?.detail || 'Submission failed.'
      setError(msg)
      toast.error(msg)
    }
  })

  const renderField = (field) => {
    if (field.auto_filled) {
      const autoVal = field.auto_fill_source === 'current_user.name' ? user?.name : ''
      return (
        <Input key={field.id} label={field.field_label} value={autoVal} disabled className="mb-4" />
      )
    }
    const common = {
      key: field.id,
      label: field.field_label,
      required: field.required,
      placeholder: field.placeholder || '',
      value: fieldValues[field.id] || '',
      className: 'mb-4'
    }
    switch (field.field_type) {
      case 'textarea':
        return <Textarea {...common} onChange={e => setField(field.id, e.target.value)} rows={3} />
      case 'number':
        return <Input {...common} type="number" onChange={e => setField(field.id, e.target.value)} />
      case 'date':
        return <Input {...common} type="date" onChange={e => setField(field.id, e.target.value)} />
      case 'dropdown':
        return (
          <Select {...common} onChange={e => setField(field.id, e.target.value)}>
            <option value="">Select…</option>
            {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
          </Select>
        )
      case 'checkbox':
        return (
          <div key={field.id} className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {field.field_label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <div className="space-y-2">
              {(field.options || []).map(o => (
                <label key={o} className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={(fieldValues[field.id] || '').includes(o)}
                    onChange={e => {
                      const cur = (fieldValues[field.id] || '').split(',').filter(Boolean)
                      if (e.target.checked) cur.push(o)
                      else cur.splice(cur.indexOf(o), 1)
                      setField(field.id, cur.join(','))
                    }}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500/30 w-4 h-4"
                  />
                  <span className="group-hover:text-slate-900 transition-colors">{o}</span>
                </label>
              ))}
            </div>
          </div>
        )
      default:
        return <Input {...common} type="text" onChange={e => setField(field.id, e.target.value)} />
    }
  }

  if (defsLoading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <Spinner />
      <p className="text-sm text-slate-400">Loading forms…</p>
    </div>
  )

  return (
    <div className="max-w-2xl space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => step === 'fill' ? setStep('select') : navigate(-1)}
          className="w-9 h-9 rounded-xl hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">New Request</h1>
          <div className="mt-0.5">
            <StepBar step={step} formName={formDef?.name} />
          </div>
        </div>
      </div>

      {/* Step 1: Select form type */}
      {step === 'select' && (
        <Card>
          <CardHeader
            title="Select Form Type"
            subtitle="Choose the type of request you want to submit"
          />
          <div className="p-4 space-y-2">
            {defs.length === 0 ? (
              <div className="text-center py-10">
                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <FileText size={20} className="text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-600">No form types available</p>
                <p className="text-xs text-slate-400 mt-1">Ask your administrator to set up form definitions.</p>
              </div>
            ) : defs.map(def => (
              <button
                key={def.id}
                onClick={() => { setSelectedDefId(def.id); setStep('fill') }}
                className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border border-slate-200 hover:border-brand-400 hover:bg-brand-50 text-left transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 group-hover:bg-brand-100 flex items-center justify-center flex-shrink-0 transition-colors">
                    <FileText size={15} className="text-slate-500 group-hover:text-brand-600 transition-colors" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 group-hover:text-slate-900">{def.name}</p>
                    {def.description && (
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{def.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <span className="text-xs text-slate-400 font-mono bg-slate-100 px-2 py-0.5 rounded-md">{def.code_suffix}</span>
                  <ChevronRight size={14} className="text-slate-300 group-hover:text-brand-500 transition-colors" />
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Step 2: Fill form */}
      {step === 'fill' && formDef && (
        <>
          {defLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Spinner />
              <p className="text-sm text-slate-400">Loading form…</p>
            </div>
          ) : formDef.pdf_template_path ? (
            <>
              <PDFFormFill
                formDef={formDef}
                values={fieldValues}
                onChange={(id, val) => setField(id, val)}
                currentUser={user}
              />
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
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
          ) : (
            <Card>
              <CardHeader
                title={formDef.name}
                subtitle={formDef.description || 'Fill in the required fields below'}
              />
              <div className="p-6">
                {formDef.fields?.filter(f => f.is_active).map(renderField)}

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">
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
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function ActionBar({ draftSaved, onSubmit, onDraft, onCancel, submitLoading, draftLoading }) {
  return (
    <div className="flex items-center gap-3 flex-wrap pt-2">
      <Button onClick={onSubmit} loading={submitLoading}>
        <Send size={14} /> Submit for Approval
      </Button>
      <Button variant="secondary" onClick={onDraft} loading={draftLoading}>
        <Save size={14} />
        {draftSaved ? 'Saved!' : 'Save Draft'}
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}
