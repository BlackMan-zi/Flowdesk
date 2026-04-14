import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listFormDefinitions, getFormDefinition, createFormInstance, saveDraft, submitFormInstance } from '../api/forms'
import Card, { CardHeader } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input, { Select, Textarea } from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'
import { useAuth } from '../context/AuthContext'
import PDFFormFill from '../components/pdf/PDFFormFill'
import { ChevronLeft } from 'lucide-react'
import { evaluateFormula } from '../utils/formulaEngine'

export default function SubmitForm() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()

  const [selectedDefId, setSelectedDefId] = useState('')
  const [fieldValues, setFieldValues] = useState({})
  const [step, setStep] = useState('select') // select | fill
  const [error, setError] = useState('')
  const [draftId, setDraftId] = useState(null)   // id of the draft instance once saved
  const [draftSaved, setDraftSaved] = useState(false)

  const handleFieldChange = (fieldId, value) => {
    setFieldValues(prev => ({ ...prev, [fieldId]: value }))
  }

  const { data: defs = [], isLoading: defsLoading } = useQuery({
    queryKey: ['form-definitions'],
    queryFn: () => listFormDefinitions().then(r => r.data)
  })

  const { data: formDef, isLoading: defLoading } = useQuery({
    queryKey: ['form-definition', selectedDefId],
    queryFn: () => getFormDefinition(selectedDefId).then(r => r.data),
    enabled: !!selectedDefId
  })

  const draftMutation = useMutation({
    mutationFn: async () => {
      const values = buildFieldValues()
      if (draftId) {
        await saveDraft(draftId, { field_values: values })
        return draftId
      } else {
        const inst = await createFormInstance({
          form_definition_id: selectedDefId,
          field_values: values
        })
        setDraftId(inst.data.id)
        return inst.data.id
      }
    },
    onSuccess: () => {
      qc.invalidateQueries(['form-instances'])
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 2500)
    },
    onError: (err) => setError(err.response?.data?.detail || 'Draft save failed.')
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const values = buildFieldValues()
      let instanceId = draftId
      if (!instanceId) {
        const inst = await createFormInstance({
          form_definition_id: selectedDefId,
          field_values: values
        })
        instanceId = inst.data.id
        setDraftId(instanceId)
      }
      await submitFormInstance(instanceId, {
        field_values: values,
        change_notes: 'Initial submission'
      })
      return instanceId
    },
    onSuccess: (id) => {
      qc.invalidateQueries(['form-instances'])
      navigate(`/my-forms/${id}`)
    },
    onError: (err) => {
      setError(err.response?.data?.detail || 'Submission failed.')
    }
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
        // Auto-fill
        if (f.auto_filled && f.auto_fill_source === 'current_user.name') {
          value = user?.name || ''
        }
        // Calculated — resolve at submit time
        if (f.field_type === 'calculated') {
          value = evaluateFormula(f.calculation_formula, fieldValues, fieldsByName)
        }
        // Table values are already JSON strings from TableFieldInput
        return { form_field_id: f.id, value: value != null ? String(value) : '' }
      })
  }

  const setField = (id, val) => setFieldValues(p => ({ ...p, [id]: val }))

  const renderField = (field) => {
    if (field.auto_filled) {
      const autoVal = field.auto_fill_source === 'current_user.name' ? user?.name : ''
      return (
        <Input
          key={field.id}
          label={field.field_label}
          value={autoVal}
          disabled
          className="mb-4"
        />
      )
    }

    const common = {
      key: field.id,
      label: `${field.field_label}${field.required ? ' *' : ''}`,
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
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {field.field_label}{field.required ? ' *' : ''}
            </label>
            <div className="space-y-1">
              {(field.options || []).map(o => (
                <label key={o} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(fieldValues[field.id] || '').includes(o)}
                    onChange={e => {
                      const cur = (fieldValues[field.id] || '').split(',').filter(Boolean)
                      if (e.target.checked) cur.push(o)
                      else cur.splice(cur.indexOf(o), 1)
                      setField(field.id, cur.join(','))
                    }}
                    className="rounded"
                  />
                  {o}
                </label>
              ))}
            </div>
          </div>
        )
      default:
        return <Input {...common} type="text" onChange={e => setField(field.id, e.target.value)} />
    }
  }

  if (defsLoading) return <div className="flex justify-center py-12"><Spinner /></div>

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-slate-900">Submit a Form</h1>
      </div>

      {step === 'select' && (
        <Card>
          <CardHeader title="Select Form Type" subtitle="Choose the type of request you want to submit" />
          <div className="p-6 space-y-2">
            {defs.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">No form types available yet.</p>
            )}
            {defs.map(def => (
              <button
                key={def.id}
                onClick={() => { setSelectedDefId(def.id); setStep('fill') }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-slate-200 hover:border-brand-400 hover:bg-brand-50 text-left transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">{def.name}</p>
                  {def.description && <p className="text-xs text-slate-500 mt-0.5">{def.description}</p>}
                </div>
                <span className="text-xs text-slate-400 font-mono">{def.code_suffix}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {step === 'fill' && formDef && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">{formDef.name}</h2>
              {formDef.description && <p className="text-sm text-slate-500 mt-0.5">{formDef.description}</p>}
            </div>
            <button onClick={() => setStep('select')} className="text-sm text-slate-500 hover:text-slate-700 underline">
              Change
            </button>
          </div>

          {defLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : formDef.pdf_template_path ? (
            /* ── PDF-backed form fill ── */
            <>
              <PDFFormFill
                formDef={formDef}
                values={fieldValues}
                onChange={handleFieldChange}
                currentUser={user}
              />
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
                  {error}
                </div>
              )}
              {draftSaved && (
                <p className="text-xs text-emerald-600 font-medium">Draft saved.</p>
              )}
              <div className="flex gap-3 pt-2 flex-wrap">
                <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
                  Submit for Approval
                </Button>
                <Button variant="secondary" onClick={() => draftMutation.mutate()} loading={draftMutation.isPending}>
                  Save Draft
                </Button>
                <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
              </div>
            </>
          ) : (
            /* ── Standard list-style form fill ── */
            <Card>
              <div className="p-6">
                {formDef.fields?.filter(f => f.is_active).map(renderField)}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 mb-4">
                    {error}
                  </div>
                )}
                {draftSaved && (
                  <p className="text-xs text-emerald-600 font-medium mb-3">Draft saved.</p>
                )}
                <div className="flex gap-3 pt-2 flex-wrap">
                  <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
                    Submit for Approval
                  </Button>
                  <Button variant="secondary" onClick={() => draftMutation.mutate()} loading={draftMutation.isPending}>
                    Save Draft
                  </Button>
                  <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
